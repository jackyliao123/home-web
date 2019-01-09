"use strict"

var api = {};

$(document).ready(function() {
	function getWebSocketURL(path) {
		return (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + path;
	}

	var ws;
	var selected = -1;
	var wsCtr = 0;
	var ongoingRequests = {};

	var lang = "en";

	var string_res = {
		en: {
			"main.banner": "Home Management",
			"pages.cameras": "Cameras",
			"pages.devices": "Devices",
			"pages.permissions": "Permissions",
		}
	};

	function getStr(str) {
		var s = string_res[lang][str];
		if(s === undefined) {
			console.error("No string found for " + str + " in " + lang);
			return str;
		}
		return s;
	}

	$("#brand").text(getStr("main.banner"));

	function connect() {
		if(ws === undefined || ws.readyState === 2 || ws.readyState === 3) {
			if(ws !== undefined) {
				ws.close();
			}
			ws = new WebSocket(getWebSocketURL("/"));

			var timeout = setTimeout(function() {
				if(ws.readyState !== 1) {
					ws.close();
				}
			}, 5000);

			ws.onopen = function() {
				console.log("[ws]: socket opened");
				clearTimeout(timeout);
				sendWS({module: "pages", action: "list"}, function(data, err) {
					if(err) {
						console.log(err);
						ws.close();
					}
					$("#pages").empty();
					for(var i = 0; i < data.length; ++i) {
						var entry = data[i];
						var a = document.createElement("a");
						a.className = "nav-link";
						a.innerText = getStr("pages." + entry.param);
						var dom = document.createElement("li");
						dom.className = "nav-item entry" + (entry.param == selected ? " active" : "");
						dom.dataset.id = entry.param;
						dom.append(a);
						$("#pages").append(dom);
					}
					addModuleListeners();
				});
			};

			ws.onerror = function(err) {
				console.log("[ws]: error: " + err);
			};

			ws.onclose = function() {
				console.log("[ws]: closed");
				clearTimeout(timeout);
				setTimeout(connect, 1000);
			};

			ws.onmessage = function(e) {
				console.log("[ws]: " + e.data);
				var json = JSON.parse(e.data);
				var req = ongoingRequests[json.id];
				if(json.err) {
					req.respond(undefined, json.err);
				} else {
					req.respond(json.data, undefined);
				}
				delete ongoingRequests[json.id];
				switch(json.op) {
					case "init":
						break;
				}
			};
		}
	}

	function sendWS(data, respond) {
		if(ws.readyState == 1) {
			data.id = wsCtr++;
			ongoingRequests[data.id] = {respond: respond, reqTime: new Date().getTime()};
			ws.send(JSON.stringify(data));
		} else {
			response(undefined, "ws_not_open");
		}
	}

	api.getStr = getStr;
	api.sendWS = sendWS;

	$("#toggler").click(function() {
		$("#sidebar").toggleClass("hidden");
	});

	$(window).resize(function() {
		if(window.innerWidth < 900) {
			$("#sidebar").addClass("hidden");
		}
	});

	function addModuleListeners() {
		$(".entry").click(function(e) {
			if($(e.currentTarget).hasClass("active"))
				return;
			$(".active").removeClass("active");
			$(e.currentTarget).addClass("active");
			var id = e.currentTarget.dataset.id;
			selected = id;
			$.ajax({
				url: "/pages/" + id,
				success: function(res) {
					$("#content").html(res);
				},
				error: function(xhr, status, error) {
					$("#content").text("Error: " + error);
				},
				complete: function() {
					$("#title").text(e.currentTarget.innerText);
				}
			});
			return false;
		});
	}

	function hide(e) {
		if(e.target.id === "content") {
			$("#sidebar").addClass("hidden");
		}
	}
	$(window).click(hide);
	$(window).on("touchstart", hide);

	connect();
});
