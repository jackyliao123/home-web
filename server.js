"use strict";

const express = require("express");
const nunjucks = require("nunjucks");
const bodyParser = require("body-parser");
const childProcess = require("child_process");
const mysql = require("promise-mysql");
const expressWs = require("express-ws");
const fs = require("fs");

const config = JSON.parse(fs.readFileSync("config.json"));

const pool = mysql.createPool(config.database);

const app = express();
app.disable("x-powered-by");

app.use(express.static("public"));

expressWs(app);
nunjucks.configure("views", {
	express: app,
	autoescape: true,
	noCache: true
});

app.use(async (req, res, next) => {
	req.client_cert = Buffer.from(req.headers["client-cert"], "hex");
	try {
		const query_res = await pool.query("SELECT id FROM users WHERE cert = ?", [req.client_cert]);
		if(query_res.length !== 1) {
			res.status(403).end();
			return;
		}
		req.client_id = query_res[0].id;
		next();
	} catch(err) {
		res.status(500).end();
		console.log(err);
	}
});

app.set("view engine", "html");
app.use(bodyParser.urlencoded({extended: false}));

app.ws("/", async (ws, req) => {
	try {
		ws.on("message", async (msg) => {
			try {
				const m = JSON.parse(msg);
				if(!perm.check_module(req.client_id, m.module, m.action, m.param)) {
					ws.send(JSON.stringify({id: m.id, err: "denied"}));
				}
				if(modules[m.module].ws_data !== undefined) {
					await modules[m.module].ws_data(req.client_id, m.action, m.param, m.data, (success, data) => {
						if(success) {
							ws.send(JSON.stringify({id: m.id, data: data}));
						} else {
							ws.send(JSON.stringify({id: m.id, err: data}));
						}
					});
				}
			} catch(err) {
				console.log(err);
			}
		});
	} catch(err) {
		ws.close();
		console.log(err);
	}
});

app.get("/", (req, res, next) => {
	res.render("index.html");
});

const modules = {};

const perm = {
	check_module: async (user, module, action, param) => {
		try {
			const query_res = await pool.query("SELECT EXISTS (SELECT * FROM user_perm WHERE user_id = ? AND (module = '*' OR module = ?) AND (action = '*' OR action = ?) AND (param = '*' OR param = ?)) AS result", [user, module, action, param]);
			return query_res[0].result === 1;
		} catch(err) {
			console.log(err);
			return false;
		}
	},
	list_param_module: async (user, module, action, select, join) => {
		try {
			const query_res = await pool.query("SELECT list_perm.param AS param" + (select === undefined ? "" : ", " + select) + " FROM user_perm JOIN list_perm ON user_perm.user_id = ? AND list_perm.module = ? AND (user_perm.module = '*' OR user_perm.module = list_perm.module) AND list_perm.action = ? AND (user_perm.action = '*' OR user_perm.action = list_perm.action)" + (join === undefined ? "" : " " + join), [user, module, action]);
			return query_res.map(v => (Object.assign({}, v)));
		} catch(err) {
			console.log(err);
			return [];
		}
	},
};

const preInitList = [];
const expressInitList = [];
const initList = [];
const postInitList = [];

fs.readdirSync("modules", {withFileTypes: true}).forEach(f => {
	if(f.isDirectory) {
		console.log("load: " + f.name);
		const name = f.name;
		const module = require("./modules/" + name + "/module.js");
		module.name = name;
		module.perm = {
			check: async (user, action, param) => perm.check_module(user, name, action, param),
			list_param: async (user, action, select, join) => perm.list_param_module(user, name, action, select, join)
		};
		module.pool = pool;
		module.modules = modules;

		if(module.preInit !== undefined) {
			preInitList.push(module);
		}
		if(module.expressInit !== undefined) {
			expressInitList.push(module);
		}
		if(module.init !== undefined) {
			initList.push(module);
		}
		if(module.postInitList !== undefined) {
			postInitList.push(module);
		}

		modules[name] = module;
	}
});

preInitList.forEach((module) => {
	console.log("preInit: " + module.name);
	module.preInit();
});

expressInitList.forEach((module) => {
	console.log("expressInit: " + module.name);
	module.app = express();
	expressWs(module.app);
	module.expressInit();
	app.use("/" + module.name, module.app);
});

initList.forEach((module) => {
	console.log("init: " + module.name);
	module.init();
});

postInitList.forEach((module) => {
	console.log("postInit: " + module.name);
	module.postInit();
});

console.log("Initialization complete");

app.listen(config.listen);
