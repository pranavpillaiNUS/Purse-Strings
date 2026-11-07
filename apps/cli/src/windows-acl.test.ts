import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateDirectorySecurity } from './windows-acl.ts';

const USER = 'S-1-5-21-1111111111-2222222222-3333333333-1001';
const OTHER = 'S-1-5-21-1111111111-2222222222-3333333333-1002';
const owner = `O:${USER}`;

test('the descriptor the backend creates is accepted', () => {
  const sddl = `${owner}D:PAI(A;OICI;FA;;;${USER})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)`;
  assert.equal(evaluateDirectorySecurity(sddl, USER), 'ok');
});

test('an owner other than the user, SYSTEM or Administrators is refused', () => {
  const acl = `D:PAI(A;OICI;FA;;;${USER})`;
  assert.equal(evaluateDirectorySecurity(`O:${OTHER}${acl}`, USER), 'foreign_owner');
  assert.equal(evaluateDirectorySecurity(`O:AU${acl}`, USER), 'foreign_owner');
  assert.equal(evaluateDirectorySecurity(`O:BA${acl}`, USER), 'ok');
  assert.equal(evaluateDirectorySecurity(`O:SY${acl}`, USER), 'ok');
});

test('the built-in Administrator account counts as Administrators, as an owner and in an entry', () => {
  // How a folder reads back when the current user is that account, as on GitHub's Windows runners.
  const admin = 'S-1-5-21-1111111111-2222222222-3333333333-500';
  const sddl = 'O:LAD:P(A;OICI;FA;;;LA)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)';
  assert.equal(evaluateDirectorySecurity(sddl, admin), 'ok');
  // Other short forms stay refused: they name groups or accounts this check does not trust.
  assert.equal(evaluateDirectorySecurity(`O:LG${`D:P(A;;FA;;;${USER})`}`, USER), 'foreign_owner');
  assert.equal(evaluateDirectorySecurity(`${owner}D:P(A;;FA;;;LG)`, USER), 'too_open');
  assert.equal(evaluateDirectorySecurity(`${owner}D:P(A;;FA;;;DU)`, USER), 'too_open');
});

test('any allow entry for anyone else is refused, even read-only, inherited or inherit-only', () => {
  for (const ace of [
    '(A;OICI;FA;;;WD)', // Everyone
    '(A;;0x1200a9;;;BU)', // Users, read and execute
    '(A;ID;0x1301bf;;;AU)', // Authenticated Users, inherited modify, as under C:\ here
    '(A;OICIIOID;SDGXGWGR;;;AU)', // inherit-only: reaches the database files, not this directory
    '(A;OICIIO;FA;;;CO)', // Creator Owner
    `(A;OICI;FA;;;${OTHER})`,
  ]) {
    assert.equal(evaluateDirectorySecurity(`${owner}D:(A;OICI;FA;;;${USER})${ace}`, USER), 'too_open', ace);
  }
});

test('a deny entry takes access away, so it does not make a directory unsafe', () => {
  assert.equal(evaluateDirectorySecurity(`${owner}D:P(D;OICI;FA;;;WD)(A;OICI;FA;;;${USER})`, USER), 'ok');
});

test('anything that cannot be read as a known shape fails closed', () => {
  for (const sddl of [
    '',
    'garbage',
    `D:P(A;OICI;FA;;;${USER})`, // no owner
    `${owner}`, // no DACL
    `${owner}D:NO_ACCESS_CONTROL`, // null DACL: everyone has full access
    `${owner}D:P`, // empty DACL
    `${owner}D:P(XA;;FA;;;${USER};(@User.x==1))`, // conditional entry
    `${owner}D:P(OA;;FA;guid;guid;${USER})(`, // malformed
    `${owner}D:P(A;;FA;;${USER})`, // too few fields
    `${owner}D:P(OA;;FA;;;${USER})`, // object entry
  ]) {
    assert.equal(evaluateDirectorySecurity(sddl, USER), 'unverifiable', sddl);
  }
  assert.equal(evaluateDirectorySecurity(`${owner}D:P(A;;FA;;;${USER})`, 'not-a-sid'), 'unverifiable');
});
