@[TOC](H265 Web player based on WASM)
# 1 Background
At this point in time, there are very few browsers that natively support H265 (HEVC) playback, and it can be said that there are almost no browsers that natively support H265 (HEVC) playback. One of the main reasons is that H265 decoding has higher performance requirements in exchange for higher compression rates. At present, most machine CPUs still have difficulty in soft decoding H265 ultra-clear videos, and the hardware decoding compatibility is not good. Another main reason is the patent fee issue of H265. Therefore, H265 has a tendency to be abandoned by major browser manufacturers and instead support the more open AV1 encoding, but it is estimated that there will be some time before AV1 encoding is commercially available and popularized.

Compared with H264, the main advantage of H265 is that it reduces the bit rate by almost half at the same resolution. For websites with relatively high bandwidth pressure, using H265 can greatly reduce bandwidth consumption (although it may face patent fee troubles), but due to browser support issues, H265 playback is currently mainly implemented on the APP side. With the help of hardware decoding, better performance and experience can be obtained.

The code related to this article uses WASM, FFmpeg, WebGL, Web Audio and other components to implement a simple web player that supports H265, as an exploration, verification, just for fun.
# 2 Code
GitHub address: [https://github.com/sonysuqin/WasmVideoPlayer](https://github.com/sonysuqin/WasmVideoPlayer).

# 3 Dependencies
## 3.1 WASM
WASM is introduced [here](https://webassembly.org/). It can execute native code (such as C, C++) in the browser. To develop native code that can run in the browser, you need to install its [tool chain](https://emscripten.org/docs/getting_started/downloads.html). I use the latest version (1.39.5). The compilation environment includes Ubuntu, MacOS, etc., which are introduced here.
## 3.2 FFmpeg
FFmpeg is mainly used for decapsulation (demux) and decoding (decoder). Since FFmpeg (3.3) is used, it can theoretically play most video formats. Here we only focus on H265 encoding and MP4 encapsulation. When compiling, you can only compile the minimum modules on demand, so as to get a relatively small library.

Compiling FFmpeg with Emscripten mainly refers to the following webpage, and some modifications are made:
[https://blog.csdn.net/Jacob_job/article/details/79434207](https://blog.csdn.net/Jacob_job/article/details/79434207)
## 3.3 WebGL
H5 uses Canvas to draw, but the default 2d mode can only draw RGB format. The video data decoded by FFmpeg is in YUV format. If you want to render it, you need to convert the color space. You can use FFmpeg's libswscale module for conversion. In order to improve performance, WebGL is used here for hardware acceleration. This project is mainly referenced and some modifications are made:
[https://github.com/p4prasoon/YUV-Webgl-Video-Player](https://github.com/p4prasoon/YUV-Webgl-Video-Player)
## 3.4 Web Audio
The audio data decoded by FFmpeg is in PCM format, which can be played using H5's Web Audio API. This project is mainly used as a reference, with some modifications:
[https://github.com/samirkumardas/pcm-player](https://github.com/samirkumardas/pcm-player)

# 4 Player implementation
Here we simply implement some of the player's functions, including downloading, decapsulation, decoding, rendering, audio and video synchronization, and many details can be optimized in each link. Currently, it can support various built-in codecs of FFmpeg, such as H264/H265, etc., and supports MP4/FLV file playback and HTTP-FLV stream playback by default.
## 4.1 Module structure
![Insert image description here](https://img-blog.csdnimg.cn/20190207123204349.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3NvbnlzdXFpbg==,size_16,color_FFFFFF,t_70)
## 4.2 Thread model
In theory, the player should use such a thread model, with each module performing its duties in its own thread:
![Insert image description here](https://img-blog.csdnimg.cn/20181221114548421.png?x-oss-process=image/watermark,type_ZmFuZ3poZW5naGVpdGk,shadow_10,text_aHR0cHM6Ly9ibG9nLmNzZG4ubmV0L3NvbnlzdXFpbg==,size_16,color_FFFFFF,t_70)
However, WASM currently does not support multithreading (pthread) well enough, and WASM multithreading support in various browsers is still in the experimental stage, so it is best not to write pthread code in native code now. Web Worker is used here to put the download and call to FFmpeg into separate threads.

There are three main threads:
- Main thread (Player): interface control, playback control, download control, audio and video rendering, audio and video synchronization;
- Decoder thread (Decoder Worker): decapsulation and decoding of audio and video data;
- Downloader thread (Downloader Worker): download a certain chunk.
Threads communicate asynchronously through postMessage. When a large amount of data (such as video frames) needs to be transmitted, the Transferable interface needs to be used to transmit to avoid the performance loss of large data copy.

## 4.3 Player
### 4.3.1 Interface
- play: start playing;
- pause: pause playing;
- resume: resume playing;
- stop: stop playing;
- fullscreen: full screen playing;
- seek: seek playing is not implemented.
### 4.3.2 Download control
To prevent the player from downloading files without limit, occupying too much CPU in the download operation and wasting too much bandwidth, after obtaining the file bit rate, the file is downloaded at a certain multiple of the bit rate.
### 4.3.3 Buffer control
Cache control is of great significance to this player. At this point in time, WASM cannot use multi-threading and multi-thread synchronization. FFmpeg's synchronous data reading interface must guarantee the return of data. So there are two measures here: 1: data cache before obtaining file metadata; 2: decoded frame cache. These two caches must be controlled to ensure that FFmpeg can return data whenever it needs to read data. When the data is insufficient, it stops decoding and enters the Buffer state. When the data is sufficient, it continues decoding and playback and returns to the Play state to ensure that FFmpeg will not report an error and exit the playback.
### 4.3.4 Audio and video synchronization
Audio data is directly fed to Web Audio. Through the Web Audio API, the timestamp of the currently playing audio can be obtained. The timestamp is used as the time reference to synchronize the video frame. If the time of the current video frame is already behind, it is rendered immediately. If it is earlier, a delay is required.
In H5, delay can be achieved through setTimeout (a better way has not been found yet). Another significance of the buffer control above is to control the rendering frequency of the video. If too many video frames are called in setTimeout, the memory will explode.
### 4.3.5 Rendering
Simply hand over the PCM data to the PCM Player and the YUV data to the WebGL Player.
## 4.4 Downloader
This module is very simple. It is separated simply to avoid doing too many things in the main thread. The main functions are:

- Get the length of the file through the Content-Length field;
- Download a chunk through the Range field.

As mentioned above, the Player will perform rate control, so the file needs to be divided into chunks and downloaded in chunks. The downloaded data is first sent to the Player, and then transferred to the Decoder by the Player (theoretically, it should be directly handed over to the Decoder, but the Downloader cannot communicate directly with the Decoder).
For streaming data, use [Fetch](https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API/Using_Fetch).

## 4.5 Decoder
This module needs to load the glue code generated by the native code, and the glue code will load wasm.

```
self.importScripts("libffmpeg.js");
```
### 4.5.1 Interface
- initDecoder: initialize the decoder and open a file cache;
- uninitDecoder: deinitialize the decoder;
- openDecoder: open the decoder and get file information;
- closeDecoder: close the decoder;
- startDecoding: start decoding;
- pauseDecoding: pause decoding.

These methods are called asynchronously by the Player module through postMessage.
### 4.5.2 Cache
Here we simply use the WASM MEMFS file interface ([WASM file system reference](https://emscripten.org/docs/api_reference/Filesystem-API.html#filesystem-api)). The way to use it is to directly call the stdio method, and then add the compilation option to the emcc compilation command:

```
-s FORCE_FILESYSTEM=1
```
MEMFS will virtualize a file system in memory. The decoder will directly write the file data sent by the player into the cache, and the decoding task will read the cache.
For streaming data, FFmpeg's ring cache FIFO is used.
### 4.5.3 Decoding
- The decoder cannot be opened immediately after playback starts, because FFmpeg needs a certain data length (such as the length of the MP4 header) to detect the data format;
- After the cached data is sufficient, the Player opens the decoder and obtains the audio parameters (number of channels, sampling rate, sampling size, data format) and video parameters (resolution, duration, color space), and uses these parameters to initialize the renderer and interface;
- When the Player calls startDecoding, a timer will be started to perform the decoding task and start decoding at a certain rate;
- When the Player cache is full, pauseDecoding will be called to pause the decoder.
### 4.5.4 Data Interaction
The decoded data is directly sent to the Player through Transferable Objects postMessage, so that references are passed without copying data, which improves performance.

Data interaction between Javascript and C:

```
Send:
……
this.cacheBuffer = Module._malloc(chunkSize);
……
Decoder.prototype.sendData = function (data) {
var typedArray = new Uint8Array(data);
Module.HEAPU8.set(typedArray, this.cacheBuffer); //Copy
Module._sendData(this.cacheBuffer, typedArray.length); //Transfer
};

Receive:
this.videoCallback = Module.addFunction(function (buff, size, timestamp) {
var outArray = Module.HEAPU8.subarray(buff, buff + size); //Copy
var data = new Uint8Array(outArray);
var objData = {
t: kVideoFrame,
s: timestamp, 
d: Data }; 
self.PostMessage(objData, [objData.D.Buffer]); //Send to Player
}); 
The callback needs to be passed to the C layer through the openDecoder method and called in the C layer.
``` 
# 5 Compile
## 5.1 Install Emscripten
Refer to its [official documentation](https://emscripten.org/docs/getting_started/downloads.html).
## 5.2 Download FFmpeg
```
git clone https://git.ffmpeg.org/ffmpeg.git
```
Here is the 3.3 branch.
## 5.3 Download the code for this article
Make sure the FFmpeg directory is at the same level as the code directory.
```
git clone https://github.com/sonysuqin/WasmVideoPlayer.git
```
## 5.4 Compile
Enter the code directory and execute:
```
./build_decoder.sh
```
# 6 Test
You can use any Http Server (Apache, Nginx, etc.), for example:
If node/npm/http-server is installed, execute in the code directory:

```
http-server -p 8080 .
```
Just enter in the browser:

```
http://127.0.0.1:8080
```
Demo address: [play](https://roblin.cn/wasm/).
# 7 Browser support
Currently (20190207), we haven't done too many strict browser compatibility tests. We mainly develop on Chrome. The latest versions of the following browsers can run:

- Chrome (webkit kernels such as 360 Browser and Sogou Browser are also supported);
- Firefox;
- Edge.
# 8 Main issues
- The CPU usage of decoding and playing H265 is relatively high;
- If the audio data is not delivered in time, the currentTime of AudioContext is not controlled, which may cause the audio and video to be out of sync.
