import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// Windows has no POSIX owner/group/other bits: Node reports every directory as
// 0o666 whatever its real access, so the mode test can only ever refuse it. The
// real boundary is the security descriptor's owner and DACL. Node has no API for
// those, so they are read through the PowerShell that ships with Windows, as SDDL,
// whose SIDs do not change with the display language.
//
// Accepted owner: the current user, SYSTEM or Administrators.
// Accepted access: allow entries for those three only, inherited or not. Deny
// entries take access away, so they are harmless. Anything else, or anything that
// cannot be read or parsed, is refused. Administrators and SYSTEM can reach every
// file on the machine anyway, so this is a one-operator boundary, not isolation
// from an administrator, and not production authentication.

const SYSTEM_SID = 'S-1-5-18';
const ADMINISTRATORS_SID = 'S-1-5-32-544';
const SDDL_ALIASES: Readonly<Record<string, string>> = { SY: SYSTEM_SID, BA: ADMINISTRATORS_SID };
const POWERSHELL_TIMEOUT_MS = 15_000;

export type DirectoryVerdict = 'ok' | 'foreign_owner' | 'too_open' | 'unverifiable';

const DESCRIPTOR = /^O:([A-Za-z0-9-]+)(?:G:[A-Za-z0-9-]+)?D:(?:P|AR|AI)*((?:\([^()]*\))+)$/;
const USER_SID = /^S-1-\d+(?:-\d+)+$/;

/** Pure decision on a descriptor. Null DACLs and conditional ACEs do not parse, so they fail closed. */
export function evaluateDirectorySecurity(sddl: string, userSid: string): DirectoryVerdict {
  if (!USER_SID.test(userSid)) return 'unverifiable';
  const match = DESCRIPTOR.exec(sddl);
  if (match === null) return 'unverifiable';
  const trusted = new Set([userSid, SYSTEM_SID, ADMINISTRATORS_SID]);
  const resolve = (sid: string): string => SDDL_ALIASES[sid] ?? sid;
  if (!trusted.has(resolve(match[1]!))) return 'foreign_owner';
  for (const ace of match[2]!.slice(1, -1).split(')(')) {
    const fields = ace.split(';');
    if (fields.length !== 6) return 'unverifiable';
    const [type, , , , , sid] = fields;
    if (type === 'D') continue;
    if (type !== 'A') return 'unverifiable';
    if (!trusted.has(resolve(sid!))) return 'too_open';
  }
  return 'ok';
}

// Paths reach PowerShell through the environment, never through the script text,
// so a path cannot become code. Only .NET calls are used, which no execution policy
// or missing module can change.
function runPowerShell(script: string, path: string): string {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (systemRoot === undefined) throw new Error('SystemRoot is not set');
  const result = spawnSync(
    join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop';${script}`],
    {
      encoding: 'utf8',
      timeout: POWERSHELL_TIMEOUT_MS,
      windowsHide: true,
      env: { SystemRoot: systemRoot, SPLITTAP_ACL_PATH: path },
    },
  );
  if (result.error !== undefined || result.status !== 0) throw new Error('PowerShell could not complete');
  return result.stdout;
}

const CURRENT_USER = '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value';
const TARGET_PATH = "[Environment]::GetEnvironmentVariable('SPLITTAP_ACL_PATH')";

export function readWindowsSecurity(path: string): { userSid: string; sddl: string } {
  const output = runPowerShell(
    `[Console]::Out.WriteLine(${CURRENT_USER});`
    + `[Console]::Out.WriteLine([IO.Directory]::GetAccessControl(${TARGET_PATH},'Owner,Access').GetSecurityDescriptorSddlForm('Owner,Access'))`,
    path,
  );
  const [userSid, sddl] = output.trim().split(/\r?\n/);
  if (userSid === undefined || sddl === undefined) throw new Error('PowerShell returned an unexpected shape');
  return { userSid, sddl };
}

export function inspectWindowsDirectory(path: string): DirectoryVerdict {
  try {
    const { userSid, sddl } = readWindowsSecurity(path);
    return evaluateDirectorySecurity(sddl, userSid);
  } catch {
    return 'unverifiable';
  }
}

/**
 * Creates the directory with its protected DACL in one call, so it never exists with
 * inherited access, even briefly. Parents must already exist. If something else
 * creates this path first, CreateDirectory leaves that directory's access alone, so
 * the caller must inspect the result afterwards.
 */
export function createWindowsPrivateDirectory(path: string): void {
  runPowerShell(
    `$u=${CURRENT_USER};`
    + '$s=[Security.AccessControl.DirectorySecurity]::new();'
    + `$s.SetSecurityDescriptorSddlForm('O:'+$u+'D:PAI(A;OICI;FA;;;'+$u+')(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)');`
    + `[void][IO.Directory]::CreateDirectory(${TARGET_PATH},$s)`,
    path,
  );
}
