"use strict"

const child_process = require("child_process");

const processes = {};

var connection_id = 0;

function subscribe(id, resid, res, path, onframe) {
	var process = processes[id];
	if(process === undefined) {
		var encoder = child_process.spawn("encoder/encoder", []);
		processes[id] = process = {
			encoder: encoder,
			req_cnt: 0,
			subs: {},
			state: -1,
			type: 0,
			len: 0,
			ptr: 0,
			buf: Buffer.allocUnsafe(65536),
		};
		encoder.stdout.on("data", (data) => {
			var ind = 0;
			while(ind < data.length) {
				if(process.state === -1) {
					process.type = data[ind];
					process.len = 0;
					process.state = 0;
					process.ptr = 0;
					ind ++;
				} else if(process.state < 8) {
					process.len |= data[ind] << 8 * process.state;
					process.state ++;
					ind ++;
					if(process.state == 8 && process.len === 0) {
						process.state = -1;
					}
				} else {
					const to_read = Math.min(process.len - process.ptr, data.length - ind);
					var newlen = process.buf.length;
					while(process.ptr + to_read > newlen) {
						newlen *= 2;
					}
					if(newlen > process.buf.length) {
						const newbuf = Buffer.allocUnsafe(newlen);
						process.buf.copy(newbuf);
						process.buf = newbuf;
					}
					data.copy(process.buf, process.ptr, ind);
					process.ptr += to_read;
					if(process.ptr >= process.len) {
						console.log("Read full frame, length = " + process.len);
						for(var subi in process.subs) {
							const sub = process.subs[subi];
							if(sub.frame_req) {
								sub.onframe(Buffer.from(process.buf, 0, process.len));
							}
						}
						if(process.req_cnt > 0) {
							encoder.stdin.write("f\n");
						}
						process.state = -1;
					}
					ind += to_read;
				}
			}
		});
		encoder.stderr.on("data", (data) => {
//			console.log(data.toString());
		});

		encoder.stdin.write("s " + path + "\n");
		encoder.stdin.write("r 640 360\n");
		encoder.stdin.write("q 25\n");
	}
	process.subs[resid] = {
		frame_req: false,
		onframe: onframe
	};
}

function unsubscribe(id, resid) {
	delete processes[id].subs[resid];
	if(Object.keys(processes[id].subs).length === 0) {
		processes[id].encoder.kill("SIGTERM");
		delete processes[id];
	}
}

function request_frame(id, resid) {
	const process = processes[id];
	if(!process.subs[resid].frame_req) {
		process.subs[resid].frame_req = true;
		process.req_cnt ++;
		if(process.req_cnt === 1) {
			process.encoder.stdin.write("f\n");
		}
	}
}

function cancel_frame(id, resid) {
	const process = processes[id];
	if(process.subs[resid].frame_req) {
		process.subs[resid].frame_req = false;
		process.req_cnt --;
	}
}

module.exports = {
	expressInit: async function() {
		this.app.get("/view/:id", async (req, res) => {
			if(!await this.perm.check(req.client_id, "view", String(req.params.id))) {
				res.status(403).end();
				return;
			}
			const query_res = await (this.pool.query("SELECT path, type FROM cameras WHERE id = ?", [req.params.id]));
			if(query_res.length !== 1) {
				res.status(404).end();
				return;
			}
			res.writeHead(200, {
				"Cache-Control": "no-store, no-cache, must-revalidate, pre-check=0, post-check=0, max-age=0",
				"Pragma": "no-cache",
				"Connection": "close",
				"Content-Type": "multipart/x-mixed-replace; boundary=KaqEzsLEszzEBJBut8xLtKPTKjkLm9b0"
			});
			const id = req.params.id;
			const path = query_res[0].path;
			const resid = connection_id ++;
			console.log("cameras: client on " + id + " connected");
			subscribe(id, resid, res, path, (data) => {
				res.write("--KaqEzsLEszzEBJBut8xLtKPTKjkLm9b0\r\nContent-Type: image/jpeg\r\nContent-Length: " + data.length + "\r\n\r\n");
				res.write(data);
				if(!res.write("\r\n")) {
					console.log("buffer full");
					cancel_frame(id, resid);
				}
			});
			request_frame(id, resid);
			res.on("drain", function() {
				console.log("buffer emptied");
				request_frame(id, resid);
			});
			req.on("close", function(err) {
				console.log("cameras: client on " + id + " disconnected");
				unsubscribe(id, resid);
			});
		});
	},
	ws_data: async function(user, action, param, data, respond) {
		switch(action) {
			case "list": 
				respond(true, await (this.perm.list_param(user, "view", "cameras.name AS name", "JOIN cameras ON list_perm.param = cameras.id")));
				break;
		}
	}
};
