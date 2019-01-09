"use strict"

module.exports = {
	init: async function() {
		this.modules.esp8266.handlers.water = {
			connect: (dev) => {
				//console.log("water connected");
				dev.configGPIO(1 << 3, 1, 1, 0, 3);
			},
			disconnect: (dev) => {
			//	console.log("water disconnected");
			},
			gpio: (dev, mask) => {
			//	console.log("water gpio " + (mask & (1 << 3)));
			}
		};
	},
};

