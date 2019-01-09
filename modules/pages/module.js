"use strict"

module.exports = {
	expressInit: function() {
		const pageOptions = {root: __dirname + "/pages/"};
		this.app.use("/:page", async (req, res) => {
			if(!await this.perm.check(req.client_id, "view", req.params.page)) {
				res.status(403).end();
				return;
			}
			var path = req.params.page;
			if(!/^[a-z]+$/.test(path)) {
				res.status(404).end();
				return;
			}
			res.sendFile(req.params.page + ".html", pageOptions);
		});
	},
	ws_data: async function(user, action, param, data, respond) {
		switch(action) {
			case "list":
				const perms = await this.perm.list_param(user, "view");
				respond(true, perms);
				break;
		}
	}
}

