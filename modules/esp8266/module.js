"use strict"

const tls = require("tls");
const fs = require("fs");
const path = require("path");

function readFile(file) {
	return fs.readFileSync(path.resolve(__dirname, file));
}

const config = JSON.parse(readFile("config.json"));

const tlsOptions = {
	key: readFile(config.key),
	cert: readFile(config.cert),
	ca: [readFile(config.ca)],
	dhparam: readFile(config.dhparam),
	ciphers: "AES256+SHA256",
	ecdhCurve: "secp384r1",
	minVersion: "TLSv1.2",
};

module.exports = {
	preInit: async function() {
		const server = tls.createServer(tlsOptions, (socket) => {

			socket.setTimeout(config.socketTimeout, () => {
				socket.destroy();
			});

			var state = -16;
			var auth = Buffer.alloc(16);
			var id;
			var pkt_type;
			var pkt_len;
			var pkt_ptr;
			var pkt_buf;

			var handler;
			var dev;

			function recvPacket() {
				const buf = Buffer.from(pkt_buf, 0, pkt_len);
				switch(pkt_type) {
					case 0:
						console.log("[esp8266] [" + id + "]: pong");
						break;
					case 2:
						if(handler !== undefined) {
							handler.gpio(dev, buf[0], buf[1]);
						}
						break;
				}
			}
			function sendPacket(type, buf) {
				try {
					socket.write(Buffer.concat([Buffer.from([type, buf.length, 0, 0]), buf]));
				} catch(err) {
					console.log(err);
					socket.destroy();
				}
			}
			const connect = () => {
				console.log("[esp8266] [" + id + "]: auth successful");

				dev = {
					configGPIO: (mask, mode, pull_up, pull_down, intr_type) => {
						const buf = Buffer.alloc(8);
						buf.writeUInt32LE(mask);
						buf[4] = mode;
						buf[5] = pull_up;
						buf[6] = pull_down;
						buf[7] = intr_type;
						sendPacket(1, buf);
					},
					requestGPIO: () => {
						sendPacket(2, Buffer.alloc(0));
					},
					setGPIO: (pin, level) => {
						sendPacket(3, Buffer.from([pin, level]));
					},
					reset: () => {
						sendPacket(255, Buffer.alloc(0));
					}
				};

				this.connected[id] = dev;
				handler = this.handlers[id];
				if(handler !== undefined) {
					if(handler.connect !== undefined) {
						handler.connect(dev);
					}
				}
			}

			function onTimeout() {
				console.log("[esp8266] [" + id + "]: timed out");
				socket.destroy();
			}

			socket.on("close", () => {
				if(id !== undefined) {
					if(handler !== undefined) {
						handler.disconnect();
					}
					delete this.connected[id];
					console.log("[esp8266] [" + id + "]: disconnected");
				}
			});

			socket.on("error", (err) => {
				console.log(err);
				socket.destroy();
			});

			var timeout = setTimeout(onTimeout, config.socketTimeout);

			socket.on("data", async (data) => {
				clearTimeout(timeout);
				timeout = setTimeout(onTimeout, config.socketTimeout);
				for(var i = 0; i < data.length; ++i) {
					var c = data[i];
					if(state < 0) {
						auth[state + 16] = c;
						state ++;
						if(state == 0) {
							var query_res = await this.pool.query("SELECT id FROM esp8266 WHERE auth = ?", [auth]);
							if(query_res.length !== 1) {
								socket.close();
								return;
							}

							id = query_res[0].id;
							connect();

							pkt_buf = Buffer.alloc(256);
						}
					} else {
						switch(state) {
							case 0:
								pkt_type = c;
								state ++;
								break;
							case 1:
								pkt_len = c;
								state ++;
								break;
							case 2:
								state ++;
								break;
							case 3:
								if(pkt_len === 0) {
									recvPacket();
									state = 0;
								} else {
									pkt_ptr = 0;
									state = 4;
								}
								break;
							case 4:
								pkt_buf[pkt_ptr ++] = c;
								if(pkt_ptr == pkt_len) {
									recvPacket();
									state = 0;
								}
								break;
						}
					}
				}
			});
		});
		server.listen(config.listen);

		setInterval(() => {
			for(var k in this.connected) {
				this.connected[k].requestGPIO();
			}
		}, config.updateInterval);
	},
	connected: {
	},
	handlers: {
	}
};

