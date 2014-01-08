precision mediump float;

uniform sampler2D simulation;
uniform sampler2D reference;
uniform float time;
varying vec2 vTextureCoordinates;

uniform float scatter[2];
uniform float size[2];
uniform vec2 position[2];
uniform float amount[2];
uniform float decay;

uniform vec2 simulationSize;
uniform vec2 windowSize;

//////////////////////////////////////////////////// SIMPLEX NOISE
//
// Description : Array and textureless GLSL 2D/3D/4D simplex 
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : ijm
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
// 


vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v)
  { 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
  }


//////////////////////////////////////////////////// MAIN

float normalizedNoise(vec3 v) {
  return snoise(v)*0.5 + 0.5;
}



vec4 normalBlend(vec4 front, vec4 back) {
  vec3 color = front.rgb*front.a + back.rgb*(1.0 - front.a)*back.a;
  float alpha = front.a + back.a*(1.0 - front.a);
  return vec4(color, alpha);

}


vec4 blend(vec4 a, float aRatio, vec4 b, float bRatio) {
  float heightFromA = aRatio * a.a;
  float heightFromB = bRatio * b.a;

  float height = heightFromA + heightFromB;
  vec3 color = (a.rgb*heightFromA + b.rgb*heightFromB) / (height + 0.00000000001);
 
  return vec4(color, height);
}

vec4 splat(vec2 p, float size, float amount, float scatter, vec2 c, float distDistortion, vec4 oldColor) {
    p.y *= windowSize.y/windowSize.x;
    
    float dist = length(c - p);

    float r = dist + size*distDistortion;
    float seed = 2.0*amount*(1.0-smoothstep(size*0.4, size, r));
    
    seed *= smoothstep(0.7, 0.8, normalizedNoise(vec3(c*scatter/size, time)));
    seed = clamp(seed, 0.0, 1.0);

    float n = 0.2;
    vec2 samplePos = vec2(p.x + 0.1*size*n, p.y + 0.1*size*n);
    vec4 foreground = texture2D(reference, samplePos);

    foreground.rgb *= 0.7 + 0.8*snoise(vec3(vTextureCoordinates, time*10.0));
    
    return blend(oldColor, 1.0, foreground, seed);

}


void main() {
    float pixelWidth = 1.0/simulationSize.x;
  float pixelHeight = 1.0/simulationSize.y;

  vec2 coord0 = vTextureCoordinates;
  vec2 gravity = vec2(0.1*snoise(vec3(coord0*20.0, time*0.2))*pixelWidth, -pixelHeight/4.0);

  vec2 coord1 = coord0 - gravity;
  vec2 coord2 = coord1 - gravity;

  vec4 sample0 = texture2D(simulation, coord0);
  vec4 sample1 = texture2D(simulation, coord1);
  vec4 sample2 = texture2D(simulation, coord2);

  float height0 = sample0.a;
  float height1 = sample1.a;
  float height2 = sample2.a;

  float velocity0 = height0;
  float velocity1 = height1;// + normalizedNoise(vec3(coord1*10.0, time))*0.8;
  float velocity2 = height2;// + normalizedNoise(vec3(coord2*10.0, time))*0.8;

  velocity0 = mix(0.0, 1.0, smoothstep(0.01, 1.0, velocity0));
  velocity1 = mix(0.0, 1.0, smoothstep(0.01, 1.0, velocity1));
  velocity2 = mix(0.0, 1.0, smoothstep(0.01, 1.0, velocity2));

  sample0 = blend(sample0, (1.0-velocity0*0.6666), sample1, velocity1*0.6666);
  sample0 = blend(sample0, (1.0-velocity0*0.3333), sample2, velocity2*0.3333);

  float multiplier = 0.999;//smoothstep(0.5, 1.0, sample0.a);
  sample0.a *= mix(1.0, multiplier, sample0.a);
  sample0.a = sample0.a - decay;
  
  vec2 c = coord0;
  c.y *= windowSize.y/windowSize.x;


  float distDistortion = snoise(vec3(c*10.0, time));
  distDistortion += snoise(vec3(c*20.0, time*2.0))*0.4;

  sample0 = splat(position[0], size[0], amount[0], scatter[0], c, distDistortion, sample0);
  sample0 = splat(position[1], size[1], amount[1], scatter[1], c, distDistortion, sample0);

  gl_FragColor = sample0;
}


