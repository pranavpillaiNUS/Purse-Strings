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
// LA is the built-in Administrator account, which always belongs to Administrators.
// SDDL writes that account as LA even when the current user is that account.
const SDDL_ALIASES: Readonly<Record<string, string>> = { SY: SYSTEM_SID, BA: ADMINISTRATORS_SID, LA: ADMINISTRATORS_SID };
const POWERSHELL_TIMEOUT_MS = 15_000;
const MISSING = 'MISSING';
/** Windows does not allow this in a file name, so it can separate paths safely. */
const PATH_SEPARATOR = '|';

export type DirectoryVerdict = 'ok' | 'foreign_owner' | 'too_open' | 'unverifiable';
export type PathVerdict = DirectoryVerdict | 'missing';

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

// Paths reach PowerShell through the environment, never through the script text, so a
// path cannot become code. Only .NET calls are used, so an execution policy or a missing
// module changes nothing. A machine locked to Constrained Language Mode blocks those
// calls, and then every folder is refused, which is the safe way to fail.
function runPowerShell(script: string, paths: readonly string[]): string {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (systemRoot === undefined) throw new Error('SystemRoot is not set');
  const result = spawnSync(
    join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop';${script}`],
    {
      encoding: 'utf8',
      timeout: POWERSHELL_TIMEOUT_MS,
      windowsHide: true,
      env: { SystemRoot: systemRoot, SPLITTAP_ACL_PATHS: paths.join(PATH_SEPARATOR) },
    },
  );
  if (result.error !== undefined || result.status !== 0) throw new Error('PowerShell could not complete');
  return result.stdout;
}

const CURRENT_USER = '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value';
const TARGET_PATHS = "[Environment]::GetEnvironmentVariable('SPLITTAP_ACL_PATHS')";

/**
 * One PowerShell start for every path, because each one costs about half a second. A path
 * that has gone by the time it is read reports MISSING: SQLite removes its sidecar files
 * when the last connection closes. Any other failure fails the whole read.
 */
function readDescriptors(paths: readonly string[]): { userSid: string; descriptors: string[] } {
  if (paths.some((path) => path.includes(PATH_SEPARATOR))) throw new Error('A path cannot be passed safely');
  const output = runPowerShell(
    `[Console]::Out.WriteLine(${CURRENT_USER});`
    + `foreach($p in ${TARGET_PATHS}.Split('${PATH_SEPARATOR}')){`
    + `try{$d=[IO.Directory]::GetAccessControl($p,'Owner,Access').GetSecurityDescriptorSddlForm('Owner,Access')}`
    + `catch{if([IO.File]::Exists($p) -or [IO.Directory]::Exists($p)){throw};$d='${MISSING}'};`
    + '[Console]::Out.WriteLine($d)}',
    paths,
  );
  const [userSid, ...descriptors] = output.trim().split(/\r?\n/);
  if (userSid === undefined || descriptors.length !== paths.length) throw new Error('PowerShell returned an unexpected shape');
  return { userSid, descriptors };
}

export function readWindowsSecurity(path: string): { userSid: string; sddl: string } {
  const { userSid, descriptors: [sddl] } = readDescriptors([path]);
  if (sddl === undefined || sddl === MISSING) throw new Error('The path could not be read');
  return { userSid, sddl };
}

/** A verdict for each path. If the read fails, every path is unverifiable. */
export function inspectWindowsPaths(paths: readonly string[]): Map<string, PathVerdict> {
  try {
    const { userSid, descriptors } = readDescriptors(paths);
    return new Map(paths.map((path, index) => {
      const sddl = descriptors[index]!;
      return [path, sddl === MISSING ? 'missing' : evaluateDirectorySecurity(sddl, userSid)];
    }));
  } catch {
    return new Map(paths.map((path) => [path, 'unverifiable']));
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
    + `[void][IO.Directory]::CreateDirectory(${TARGET_PATHS},$s)`,
    [path],
  );
}
