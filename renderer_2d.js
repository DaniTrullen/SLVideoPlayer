class Canvas2DRenderer {
    _canvas = null;
    _ctx = null;
    _imageData=null;
  
    constructor(canvas) {
      this._canvas = canvas;
      this._ctx = canvas.getContext("2d",{
        alpha: false,
        colorSpace: "srgb"
      });
    }
  
    initImageData(width, height) {
			this._imageData = this._ctx.createImageData(width, height);
			// Prefill the alpha to opaque
			var data = this._imageData.data;
			var pixelCount = width * height * 4;
			for (var i = 0; i < pixelCount; i += 4) {
				data[i + 3] = 255;
			}
		}

    /**
     * Converteix de YUV 4:2:0 a RGBA (per enviar al canvas)
     * @param {Uint8Array} yuv Buffer amb els pixels YUV 4:2:0
     * @param {*} width mida horitzontal de la imatge en pixels
     * @param {*} height mida vertical de la imatge en pixels
     * @param {Uint8ClampedArray} rgba buffer de sortida
     */
    yuv2rgba(yuv, width, height, rgba) {
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
    }  

    /**
     * 
     * @param {Uint8Array} yuvdata 
     * @param {number} width 
     * @param {number} height 
     * @param {number} yLength Bytes que ocupa la lluminancia
     * @param {number} uvLength Byyes que ocupen les components de croma
     */
    renderFrame(yuvdata, width, height, yLength, uvLength) {
      //ajustem la mida del canvas a la mida de la imatge
      if(this._canvas.width !== width) this._canvas.width = width;
      if(this._canvas.height !== height) this._canvas.height = height;

      this.initImageData(width,height);  //només fer-ho un cop!!
      this.yuv2rgba(yuvdata, width, height, this._imageData.data)

      //console.log(`display frame width=${width}, height=${height}`)
      this._ctx.putImageData(this._imageData, 0, 0);
    }
  };
  