CREATE TABLE esp8266 (
	id VARCHAR(63) NOT NULL PRIMARY KEY,
	auth BINARY(16) NOT NULL UNIQUE
);
