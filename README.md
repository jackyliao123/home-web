# Home Management Server
This is a work-in-progress project. 

This project aims to build a secure system that manages the IoT devices at home. It provides a centralized website, when usually these devices require downloading their own apps to interact with them. 

This system is modular, and custom modules can be added for custom functionality.

### Modules
| Module | Progress | Requirements | Description |
|--------|----------|--------------|-------------|
| `cameras` | Basic functionality | `ffmpeg` installed | Re-encodes streams into mjpeg for web viewing |
| `devices` | Not started | | Manage all connected IoT devices |
| `esp8266` | Functional | | Manages connected esp8266 devices |
| `esp8266_water` | Not started | `esp8266` module | Monitors the water level and sends warnings |
| `esp8266_doorbell` | Not started | `esp8266` module | Plays doorbell sound effect when doorbell triggers
| `pages` | Functional | | Serves the user pages to allow interaction with the modules

### Pages
| Page | Progress | Requirements | Description |
|------|----------|--------------|-------------|
| `cameras` | Basic functionality | `cameras` module | A page for viewing and controlling cameras |
| `devices` | Not started | `devices` module | A page for managing IoT devices |
| `permissions` | Not started |  | A page for managing user permissions |

### Requirements
- `node.js` and `npm`
- `MySQL` or equivalent
- `ffmpeg` (required for `cameras` module)
- Client certificate SHA-1 fingerprint in the `client-cert` header

### Running

A `config.json` should be created in the root directory of this project. See `config.json.example` for an example.

For module specific configurations, a `config.json` should be created in the directory of the module. Modules that require configuration will have a `config.json.example`.

A `MySQL` or equivalent database with a database named `home-web` and a user named `home-web` with all permissions on the `home-web` database should be created.

To create the necessary tables (this will destroy existing tables in the database), run

    cd db_scripts
    ./reconstruct

Note that your user need permissions on the `home-web` database in order for this to work.
