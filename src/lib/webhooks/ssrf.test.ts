import { describe, it, expect } from 'vitest';
import { isPrivateOrReservedIp, isDeliverableUrl } from './ssrf';

describe('isPrivateOrReservedIp', () => {
  it('flags loopback / private / link-local / CGNAT IPv4', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
    ]) {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '93.184.216.34']) {
      expect(isPrivateOrReservedIp(ip)).toBe(false);
    }
  });

  it('flags loopback / ULA / link-local IPv6 and IPv4-mapped privates', () => {
    for (const ip of ['::1', 'fe80::1', 'fc00::1', 'fd12::34', '::ffff:127.0.0.1']) {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    }
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });

  it('flags every way of writing an embedded private IPv4 address', () => {
    for (const ip of [
      '::ffff:7f00:1', // 127.0.0.1, the form new URL() produces
      '[::ffff:a9fe:a9fe]', // 169.254.169.254
      '0:0:0:0:0:ffff:a00:1', // 10.0.0.1
      '::127.0.0.1', // IPv4-compatible
      '64:ff9b::a9fe:a9fe', // NAT64
      '2002:7f00:1::', // 6to4
      'ff02::1', // multicast
    ]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
    expect(isPrivateOrReservedIp('::ffff:808:808')).toBe(false); // 8.8.8.8
  });

  it('flags reserved IPv4 ranges', () => {
    for (const ip of ['198.18.0.1', '224.0.0.1', '255.255.255.255', '192.0.2.10']) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
  });

  it('refuses garbage instead of allowing it', () => {
    expect(isPrivateOrReservedIp('not-an-ip')).toBe(true);
  });
});

describe('isDeliverableUrl', () => {
  it('rejects literal private IPs and internal names without DNS', async () => {
    expect(await isDeliverableUrl('https://127.0.0.1/hook')).toBe(false);
    expect(await isDeliverableUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(await isDeliverableUrl('https://[::1]/hook')).toBe(false);
    expect(await isDeliverableUrl('https://localhost/hook')).toBe(false);
    expect(await isDeliverableUrl('https://foo.internal/hook')).toBe(false);
    expect(await isDeliverableUrl('http://[::ffff:127.0.0.1]/')).toBe(false);
    expect(await isDeliverableUrl('http://[::ffff:a9fe:a9fe]/latest/meta-data')).toBe(false);
    expect(await isDeliverableUrl('http://2130706433/')).toBe(false);
  });

  it('rejects a malformed URL', async () => {
    expect(await isDeliverableUrl('not a url')).toBe(false);
  });

  it('allows a literal public IP', async () => {
    expect(await isDeliverableUrl('https://8.8.8.8/hook')).toBe(true);
  });
});
