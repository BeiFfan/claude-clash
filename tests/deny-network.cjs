// Offline test guard: reject DNS, TCP, UDP and HTTP connections.
const deny = () => { throw new Error('Network forbidden in offline tests'); };
for (const name of ['http','https']) {
  const mod = require('node:' + name);
  mod.request = deny; mod.get = deny;
}
const net = require('node:net');
net.Socket.prototype.connect = deny;
net.Server.prototype.listen = deny;
const dns = require('node:dns');
for (const key of ['lookup','resolve','resolve4','resolve6','reverse']) dns[key] = deny;
const dgram = require('node:dgram'); dgram.createSocket = deny;
globalThis.fetch = deny;
