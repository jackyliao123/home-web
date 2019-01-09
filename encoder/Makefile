CC=gcc
CFLAGS=-O3 -pthread
LDFLAGS=-lavformat -lavcodec -lavutil -lturbojpeg -lswscale -lm

encoder: encoder.c
	$(CC) -o $@ $^ $(CFLAGS) $(LDFLAGS)

.PHONY: clean

clean:
	rm -f encoder
