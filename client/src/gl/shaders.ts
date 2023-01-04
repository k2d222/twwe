export const TW_VERT = `
  attribute vec2 aPosition;
  attribute vec4 aVertexColor;
  attribute vec2 aTexCoord;
  uniform mat4 uPMatrix;
  uniform mat4 uMVMatrix;
  uniform bool uTexCoord;
  uniform bool uVertexColor;

  varying vec2 vTexCoord;
  varying vec4 vColor;

  void main(void)
  {
    gl_Position = uPMatrix * uMVMatrix * vec4(aPosition.x, aPosition.y, 0.0, 1.0);
    if (uTexCoord)
      vTexCoord = aTexCoord;
    if (uVertexColor)
      vColor = aVertexColor;
  }
` as const

export const TW_FRAG = `
  precision mediump float;

  varying vec2 vTexCoord;
  varying vec4 vColor;
  uniform sampler2D uSampler;
  uniform vec4 uColorMask;
  uniform bool uTexCoord;
  uniform bool uVertexColor;

  void main(void)
  {
    gl_FragColor = uColorMask;
    if (uTexCoord)
      gl_FragColor *= texture2D(uSampler, vec2(vTexCoord.s, vTexCoord.t));
    if (uVertexColor)
      gl_FragColor *= vColor;

    // premultiplied alpha
    gl_FragColor.rgb *= gl_FragColor.a;
  }
` as const
