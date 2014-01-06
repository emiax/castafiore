precision mediump float;

attribute vec2 aVertexPosition;
varying vec2 vTextureCoordinates;

void main() {
  vTextureCoordinates = (aVertexPosition + vec2(1.0, 1.0)) * 0.5;
  gl_Position = vec4(aVertexPosition, 0.0, 1.0);
}
