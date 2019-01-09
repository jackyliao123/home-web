#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswscale/swscale.h>

#include <turbojpeg.h>

#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <pthread.h>

#include <math.h>

#define INPUT_BUF_SIZE 4096

volatile unsigned width;
volatile unsigned height;
volatile unsigned quality = 75;
volatile char output_frame;

pthread_mutex_t prop_change = PTHREAD_MUTEX_INITIALIZER;

void info(const char *fmt, ...) {
	va_list args;
	va_start(args, fmt);
	fprintf(stderr, "info: ");
	vfprintf(stderr, fmt, args);
	fprintf(stderr, "\n");
	va_end(args);
}

void err(const char *fmt, ...) {
	va_list args;
	va_start(args, fmt);
	fprintf(stderr, "error: ");
	vfprintf(stderr, fmt, args);
	fprintf(stderr, "\n");
	va_end(args);
	exit(1);
}

void *decode_start(void *arg) {

	tjhandle jpeg = tjInitCompress();

	unsigned char *jpeg_buf = NULL;
	unsigned long long jpeg_size = 0;

	AVFormatContext *context = avformat_alloc_context();
	if(!context) {
		err("avformat_alloc_context");
	}

	struct SwsContext *sws_context = NULL;

	int ret = avformat_open_input(&context, arg, NULL, NULL);

	free(arg);

	if(ret < 0) {
		err("avformat_open_input\n");
	}

	if(avformat_find_stream_info(context, NULL) < 0)
		err("avformat_find_stream_info\n");

	int video_ind = -1;
	int audio_ind = -1;

	AVCodec *video_codec = NULL;
	AVCodec *audio_codec = NULL;

	AVCodecParameters *video_params = NULL;
	AVCodecParameters *audio_params = NULL;

	for(int i = 0; i < context->nb_streams; ++i) {
		info("stream #%d", i);
		AVCodecParameters *codec_params = context->streams[i]->codecpar;

		AVCodec *codec = avcodec_find_decoder(codec_params->codec_id);

		if(codec == NULL)
			err("no codec for stream #%d\n", i);

		if(codec_params->codec_type == AVMEDIA_TYPE_VIDEO) {
			video_ind = i;
			video_codec = codec;
			video_params = codec_params;
			info("    video: %d x %d", codec_params->width, codec_params->height);
		} else if(codec_params->codec_type == AVMEDIA_TYPE_AUDIO) {
			audio_ind = i;
			audio_codec = codec;
			audio_params = codec_params;
			info("    audio: rate %d, %d channels", codec_params->sample_rate, codec_params->channels);
		}
	}

	AVCodecContext *video_context = avcodec_alloc_context3(video_codec);
	if(!video_context)
		err("avcodec_alloc_context3");

	if(avcodec_parameters_to_context(video_context, video_params))
		err("avcodec_parameters_to_context");

	if(avcodec_open2(video_context, video_codec, NULL) < 0)
		err("avcodec_open2");

	AVFrame *frame = av_frame_alloc();
	if(!frame)
		err("av_frame_alloc");

	AVFrame *frame_resized = av_frame_alloc();
	if(!frame)
		err("av_frame_alloc");

	AVPacket *packet = av_packet_alloc();
	if(!packet)
		err("av_packet_alloc");

	unsigned sw, sh, sq;
	char allocated = 0;

	while(av_read_frame(context, packet) >= 0) {
		if(packet->stream_index == video_ind) {
			if(avcodec_send_packet(video_context, packet) < 0)
				err("avcodec_send_packet");

			while(1) {
				int res = avcodec_receive_frame(video_context, frame);
				if(res == AVERROR(EAGAIN) || res == AVERROR_EOF)
					break;
				if(res < 0)
					err("avcodec_receive_frame");

				info(
					"Frame %d (type=%c, size=%d bytes) pts %d key_frame %d [DTS %d]",
					video_context->frame_number,
					av_get_picture_type_char(frame->pict_type),
					frame->pkt_size,
					frame->pts,
					frame->key_frame,
					frame->coded_picture_number
				);

				char out;
				char realloc_resized;

				pthread_mutex_lock(&prop_change);
				realloc_resized = sw != width || sh != height;
				sw = width;
				sh = height;
				sq = quality;
				out = output_frame;
				output_frame = 0;
				pthread_mutex_unlock(&prop_change);

				if(out) {
					if(realloc_resized) {
						if(allocated) {
							avpicture_free((AVPicture *) frame_resized);
						}
						if(avpicture_alloc((AVPicture *) frame_resized, AV_PIX_FMT_YUV420P, sw, sh) < 0) {
							err("avpicture_alloc");
						}
						allocated = 1;
					}

					sws_context = sws_getCachedContext(sws_context, frame->width, frame->height, AV_PIX_FMT_YUV420P, sw, sh, AV_PIX_FMT_YUV420P, SWS_BICUBIC, NULL, NULL, NULL);

					sws_scale(sws_context, frame->data, frame->linesize, 0, frame->height, frame_resized->data, frame_resized->linesize);

					int ret = tjCompressFromYUVPlanes(jpeg, frame_resized->data, sw, frame_resized->linesize, sh, TJSAMP_420, &jpeg_buf, &jpeg_size, sq, TJFLAG_FASTDCT);

					if(ret == -1) {
						err("tjCompressFromYUVPlanes: %s", tjGetErrorStr());
					}

					if(write(1, "f", 1) < 0)
						err("write");
					if(write(1, &jpeg_size, 8) < 0)
						err("write");

					size_t wr = 0;
					while(wr < jpeg_size) {
						int w = write(1, jpeg_buf + wr, jpeg_size - wr);
						if(wr < 0) {
							err("write failed");
						}
						wr += w;
					}
				}
				
				av_frame_unref(frame);
			}

			av_packet_unref(packet);
		}
	}

	avformat_close_input(&context);
	avformat_free_context(context);
	av_packet_free(&packet);
	av_frame_free(&frame);
	avcodec_free_context(&video_context);

	tjDestroy(jpeg);
	return NULL;
}

int main() {

	int ret;

	char cmd[INPUT_BUF_SIZE];

	pthread_t decode_thread;

	unsigned w, h, q;

	while(1) {
		if(fgets(cmd, 4096, stdin)) {
			size_t len = strlen(cmd);
			if(len < 1)
				continue;
			switch(cmd[0]) {
				case 's':
					if(len < 2)
						continue;
					if(cmd[len - 1] == '\n')
						cmd[len - 1] = '\0';
					char *c = malloc(len - 2);
					memcpy(c, cmd + 2, len - 2);
					ret = pthread_create(&decode_thread, NULL, decode_start, c);
					if(ret) {
						err("pthread_create: %d", ret);
					}
					break;
				case 'q':
					if(sscanf(cmd + 1, "%u", &q) == 1) {
						pthread_mutex_lock(&prop_change);
						quality = q;
						pthread_mutex_unlock(&prop_change);
					}
					break;
				case 'r':
					if(sscanf(cmd + 1, "%u%u", &w, &h) == 2) {
						pthread_mutex_lock(&prop_change);
						width = w;
						height = h;
						pthread_mutex_unlock(&prop_change);
					}
					break;
				case 'f':
					pthread_mutex_lock(&prop_change);
					output_frame = 1;
					pthread_mutex_unlock(&prop_change);
					break;
			}
		}
	}

	return 0;
}

