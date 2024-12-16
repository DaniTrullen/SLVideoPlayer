"use strict";
class YUVConverter{
	constructor(){}


   /**
   * Convert a ratio into a bit-shift count; for instance a ratio of 2
   * becomes a bit-shift of 1, while a ratio of 1 is a bit-shift of 0.
   *
   * @author Brooke Vibber <bvibber@pobox.com>
   * @copyright 2016-2024
   * @license MIT-style
   *
   * @param {number} ratio - the integer ratio to convert.
   * @returns {number} - number of bits to shift to multiply/divide by the ratio.
   * @throws exception if given a non-power-of-two
   */
	// depower(ratio) {
	// 	var shiftCount = 0,
	// 		n = ratio >> 1;
	// 	while (n != 0) {
	// 		n = n >> 1;
	// 		shiftCount++
	// 	}
	// 	if (ratio !== (1 << shiftCount)) {
	// 		throw 'chroma plane dimensions must be power of 2 ratio to luma plane dimensions; got ' + ratio;
	// 	}
	// 	return shiftCount;
	// }

	YUV2RBG(yuv, width, height, rgba) {
		const uStart = width * height;
		const halfWidth = (width >>> 1);
		const vStart = uStart + (uStart >>> 2);
		//const rgb = new Uint8ClampedArray(uStart * 3);
	  
		let i = 0;
		for (let y = 0; y < height; y++) {
		  for (let x = 0; x < width; x++) {
			const yy = yuv[y * width + x];
			const colorIndex = (y >>> 1) * halfWidth + (x >>> 1);
			const uu = yuv[uStart + colorIndex] - 128;
			const vv = yuv[vStart + colorIndex] - 128;
	  
			rgba[i++] = yy + 1.402 * vv;              // R
			rgba[i++] = yy - 0.344 * uu - 0.714 * vv; // G
			rgba[i++] = yy + 1.772 * uu;              // B
			rgba[i++] =255; //alpha
		  }
		}
	  
		//return rgb;
	  }
	  







	/**
	 * Basic YCbCr->RGB conversion
	 *
	 * @param {Uint8Array} buffer - input frame buffer yuv 420 planar
	 * @param {Uint8ClampedArray} output - array to draw RGBA into
	 * Assumes that the output array already has alpha channel set to opaque.
	 */
	// convertYCbCr(buffer, width, height, yLength, uvLength, output) {
	// 	var hdec = 1;// depower(width / buffer.format.chromaWidth) | 0
	// 	var vdec = 1;//depower(height / buffer.format.chromaHeight) | 0,
		
	// 	var bytesY = width * height
	// 	var bytesCb = //buffer.u.bytes
	// 	var bytesCr = //buffer.v.bytes,
	// 	var strideY = 0; //buffer.y.stride | 0,
	// 	var strideCb = 0; //buffer.u.stride | 0,
	// 	var strideCr = 0; // buffer.v.stride | 0,
	// 	var outStride = width << 2,
	// 	var YPtr = 0, Y0Ptr = 0, Y1Ptr = 0,
	// 	var CbPtr = 0, CrPtr = 0,
	// 	var outPtr = 0, outPtr0 = 0, outPtr1 = 0,
	// 	var colorCb = 0, colorCr = 0,
	// 	var multY = 0, multCrR = 0, multCbCrG = 0, multCbB = 0,
	// 	var x = 0, y = 0, xdec = 0, ydec = 0;

	// 	if (hdec == 1 && vdec == 1) {
	// 		// Optimize for 4:2:0, which is most common
	// 		outPtr0 = 0;
	// 		outPtr1 = outStride;
	// 		ydec = 0;
	// 		for (y = 0; y < height; y += 2) {
	// 			Y0Ptr = y * strideY | 0;
	// 			Y1Ptr = Y0Ptr + strideY | 0;
	// 			CbPtr = ydec * strideCb | 0;
	// 			CrPtr = ydec * strideCr | 0;
	// 			for (x = 0; x < width; x += 2) {
	// 				colorCb = bytesCb[CbPtr++] | 0;
	// 				colorCr = bytesCr[CrPtr++] | 0;

	// 				// Quickie YUV conversion
	// 				// https://en.wikipedia.org/wiki/YCbCr#ITU-R_BT.2020_conversion
	// 				// multiplied by 256 for integer-friendliness
	// 				multCrR   = (409 * colorCr | 0) - 57088 | 0;
	// 				multCbCrG = (100 * colorCb | 0) + (208 * colorCr | 0) - 34816 | 0;
	// 				multCbB   = (516 * colorCb | 0) - 70912 | 0;

	// 				multY = 298 * bytesY[Y0Ptr++] | 0;
	// 				output[outPtr0    ] = (multY + multCrR) >> 8;
	// 				output[outPtr0 + 1] = (multY - multCbCrG) >> 8;
	// 				output[outPtr0 + 2] = (multY + multCbB) >> 8;
	// 				outPtr0 += 4;

	// 				multY = 298 * bytesY[Y0Ptr++] | 0;
	// 				output[outPtr0    ] = (multY + multCrR) >> 8;
	// 				output[outPtr0 + 1] = (multY - multCbCrG) >> 8;
	// 				output[outPtr0 + 2] = (multY + multCbB) >> 8;
	// 				outPtr0 += 4;

	// 				multY = 298 * bytesY[Y1Ptr++] | 0;
	// 				output[outPtr1    ] = (multY + multCrR) >> 8;
	// 				output[outPtr1 + 1] = (multY - multCbCrG) >> 8;
	// 				output[outPtr1 + 2] = (multY + multCbB) >> 8;
	// 				outPtr1 += 4;

	// 				multY = 298 * bytesY[Y1Ptr++] | 0;
	// 				output[outPtr1    ] = (multY + multCrR) >> 8;
	// 				output[outPtr1 + 1] = (multY - multCbCrG) >> 8;
	// 				output[outPtr1 + 2] = (multY + multCbB) >> 8;
	// 				outPtr1 += 4;
	// 			}
	// 			outPtr0 += outStride;
	// 			outPtr1 += outStride;
	// 			ydec++;
	// 		}
	// 	} else {
	// 		// outPtr = 0;
	// 		// for (y = 0; y < height; y++) {
	// 		// 	xdec = 0;
	// 		// 	ydec = y >> vdec;
	// 		// 	YPtr = y * strideY | 0;
	// 		// 	CbPtr = ydec * strideCb | 0;
	// 		// 	CrPtr = ydec * strideCr | 0;

	// 		// 	for (x = 0; x < width; x++) {
	// 		// 		xdec = x >> hdec;
	// 		// 		colorCb = bytesCb[CbPtr + xdec] | 0;
	// 		// 		colorCr = bytesCr[CrPtr + xdec] | 0;

	// 		// 		// Quickie YUV conversion
	// 		// 		// https://en.wikipedia.org/wiki/YCbCr#ITU-R_BT.2020_conversion
	// 		// 		// multiplied by 256 for integer-friendliness
	// 		// 		multCrR   = (409 * colorCr | 0) - 57088 | 0;
	// 		// 		multCbCrG = (100 * colorCb | 0) + (208 * colorCr | 0) - 34816 | 0;
	// 		// 		multCbB   = (516 * colorCb | 0) - 70912 | 0;

	// 		// 		multY = 298 * bytesY[YPtr++] | 0;
	// 		// 		output[outPtr    ] = (multY + multCrR) >> 8;
	// 		// 		output[outPtr + 1] = (multY - multCbCrG) >> 8;
	// 		// 		output[outPtr + 2] = (multY + multCbB) >> 8;
	// 		// 		outPtr += 4;
	// 		// 	}
	// 		}
	// 	}
	// }
}
