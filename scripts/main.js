require([
    'scripts/vj',
    'scripts/simulationEnv',
], function(VJ, SimulationEnv) {
    var canvas = document.getElementById('canvas');
    var gl = getContext(canvas);

    var stats = new Stats();

    var textures = {};

    /**
     * GLSL rendering program
     */
    var renderingProgram = null;

    /**
     * GLSL simulation program
     */
    var simulationProgram = null;

    /**
     * Number of seeds. (splat points)
     */
    var nSeeds = 2;

    /**
     * Simulation Env
     */
    var simulationEnv = null;

    /*
     * Time
     */
    var t = 0;

    /**
     * SimulationBuffers.
     */
    var simulationBuffers = [];

    /**
     * Framebuffers.
     */
    var simulationTextures = [];

    
    /**
     * Current Texture url.
     */
    var currentTextureUrl = '';


    /**
     * Window changed size.
     */
    var windowChangedSize = false;


    /**
     * Return current simulation resolution.
     */
    function simulationResolution() {
        return {
            w: Math.round(canvas.width*0.8),
            h: Math.round(canvas.height*0.8)
        }
    }


    /**
     * Try to exctract the webgl context
     */
    function getContext() {
        var gl;
        try {
            gl = canvas.getContext('webgl');
        } catch (e) {
            alert("could not initialize webgl.");
        }
        return gl;
    }


    /**
     * Get a shader source file from url and invoke cb(shader) when done.
     * If url ends with .vs the shader is treated as a vertex shader.
     */
    function getShader(url, cb) {
        var req = new XMLHttpRequest();
        var type = url.substr(url.indexOf('.') + 1) === 'vs' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER;

        req.open("GET", url, true);
        req.onreadystatechange = function () {
            if (req.readyState == 4 && req.status == 200) {
                var source = req.responseText;
                var shader = gl.createShader(type);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);

                if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    console.log("'" + url + "' compiled successfully.");
                    if (cb) { cb(shader); }
                } else {
                    console.error(gl.getShaderInfoLog(shader));
                }
            }

        }
        req.send();
    }


    /**
     * Get multiple shaders and invoke cb(id->shader)
     * Spec is a map id->sourceUrl
     */
    function getShaders(spec, cb) {
        var shaders = {};

        function recieveShader(id, shader) {
            shaders[id] = shader;
            var done = true;
            Object.keys(spec).forEach(function (id) {
                if (!shaders[id]) {
                    done = false;
                }
            });
            if (done) cb(shaders);
        }

        Object.keys(spec).forEach(function (id) {
            var url = spec[id];
            getShader(url, function (shader) {
                recieveShader(id, shader);
            });
        });
    }


    /*
     * Get texture
     */
    function getTexture(url, cb) {
        var texture = gl.createTexture();
        texture.image = new Image();
        texture.image.onload = function () {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            gl.bindTexture(gl.TEXTURE_2D, null);
            cb(texture);
        }
        texture.image.src = url;
        texture.url = url;
    }


    /**
     * Get multiple shaders and invoke cb(id->texture)
     * Spec is a map id->imageUrl
     */
    function getTextures(spec, cb) {
        var newTextures = {};
        function recieveTexture(id, texture) {
            if (textures[id]) {
                gl.deleteTexture(textures[id]);
            }

            textures[id] = newTextures[id] = texture;
            var done = true;
            Object.keys(spec).forEach(function (id) {
                if (!newTextures[id]) {
                    done = false;
                }
            });
            if (done && cb) cb(textures);
        }

        Object.keys(spec).forEach(function (id) {
            var url = spec[id];
            getTexture(url, function (texture) {
                recieveTexture(id, texture);
            });
        });
    }


    /**
     * Start rendering
     */
    function startRendering() {
        var mode = 0;
        function renderLoop() {
            stats.begin();
            mode = !mode;

            if (windowChangedSize) {
                clearSimulationBuffer(!mode);
            }
            
            simulate(mode, simulationEnv);
            
            if (windowChangedSize) {
                clearSimulationBuffer(mode);
            }
            
            windowChangedSize = false;

            render(mode);
            tick();
            stats.end();
            requestAnimationFrame(renderLoop);
        }
        renderLoop();
    }


    /**
     * Simulate
     */
    function simulate(mode, simulationEnv) {
        // reload texture
        
        var res = simulationResolution();
        gl.viewport(0, 0, res.w, res.h);

        var newTextureUrl = simulationEnv.textureUrl();
        if (newTextureUrl && currentTextureUrl !== newTextureUrl) {
            currentTextureUrl = newTextureUrl;
            getTextures({
                reference: simulationEnv.textureUrl()
            });
        }

        // Prepare for rendering to back simulation buffer.
        var backBuffer = simulationBuffer(!mode);
        gl.bindFramebuffer(gl.FRAMEBUFFER, backBuffer);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(simulationProgram);

        // Vertex buffer.
        var squareVB = squareVertexBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, squareVB);
        gl.vertexAttribPointer(simulationProgram.vertexPositionAttribute, squareVB.nDimensions, gl.FLOAT, false, 0, 0);

        // Send in the front buffer (old simulation step)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, simulationTexture(mode));
        gl.uniform1i(simulationProgram.simulationUniform, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, textures['reference']);

        gl.uniform1i(simulationProgram.referenceUniform, 1);

        var seeds = simulationEnv.emit();

        var scatter = new Float32Array(nSeeds);
        var size = new Float32Array(nSeeds);
        var position = new Float32Array(nSeeds*2);
        var amount = new Float32Array(nSeeds);

        seeds.forEach(function (v, k) {
            v = v || {};
            scatter[k] = v.scatter || 0;
            size[k] = v.size || 0;
            if (v.position) {
                position[k*2] = v.position.x;
                position[k*2+1] = v.position.y;
            } else {
                position[k*2] = 0;
                position[k*2 + 1] = 0;
            }
            amount[k] = v.amount || 0;
        });
        

        gl.uniform1fv(simulationProgram.scatterUniform, scatter);
        gl.uniform1fv(simulationProgram.sizeUniform, size);
        gl.uniform2fv(simulationProgram.positionUniform, position);
        gl.uniform1fv(simulationProgram.amountUniform, amount);


        var res = simulationResolution();
        gl.uniform2f(simulationProgram.simulationSizeUniform, res.w, res.h)
        gl.uniform2f(simulationProgram.windowSizeUniform, canvas.width, canvas.height);
        
        var decay = simulationEnv.decay();
        gl.uniform1f(simulationProgram.decayUniform, decay);
        gl.uniform1f(simulationProgram.timeUniform, time());
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, squareVB.nVertices);
    }


    function time() {
        return t;
    }


    function tick() {
        t+=0.01;
    }

    /**
     * Render one frame
     */
    function render(mode) {
        // Prepare for rendering.
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(renderingProgram);

        // Vertex buffer.
        var squareVB = squareVertexBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, squareVB);
        gl.vertexAttribPointer(renderingProgram.vertexPositionAttribute, squareVB.nDimensions, gl.FLOAT, false, 0, 0);

        // Simuulation texture.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, simulationTexture(mode));
        gl.uniform1i(renderingProgram.simulationUniform, 0);

        // Rendering needs time uniform.
        gl.uniform1f(renderingProgram.timeUniform, time());
        
        gl.uniform2f(renderingProgram.windowSizeUniform, canvas.width, canvas.height);

        var bgA = simulationEnv.backgroundColorA();
        var bgB = simulationEnv.backgroundColorB();

        gl.uniform4f(renderingProgram.backgroundColorAUniform, bgA.r, bgA.g, bgA.b, 1);
        gl.uniform4f(renderingProgram.backgroundColorBUniform, bgB.r, bgB.g, bgB.b, 1);

        // Now render!
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, squareVB.nVertices);

    }


    /**
     * Create a square vertex buffer if it does not yet exist.
     * Return it.
     */
    var squareVertexBuffer = (function() {
        var vertexBuffer = null;
        // The real function is returned
        return (function () {
            if (!vertexBuffer) {
                // create a nice square.
                vertices = [
                        +1, +1,
                        -1, +1,
                        +1, -1,
                        -1, -1
                ];

                var vertexBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

                vertexBuffer.nDimensions = 2;
                vertexBuffer.nVertices = 4;
            }
            return vertexBuffer;
        })
    }());


    /**
     * Create a simulation framebuffer with id if it does not yet exist.
     * Return it.
     */
    var simulationBuffer = (function () {
        // The real function is returned
        return (function(id) {
            if (!simulationBuffers[id]) {
                simulationBuffers[id] = gl.createFramebuffer();
                gl.bindFramebuffer(gl.FRAMEBUFFER, simulationBuffers[id]);

                var renderbuffer = gl.createRenderbuffer();
                gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
                var res = simulationResolution();
                gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, res.w, res.h);

                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, simulationTexture(id), 0);
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);


                gl.bindRenderbuffer(gl.RENDERBUFFER, null);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
            return simulationBuffers[id];
        });
    }());


    /**
     * Create a simulation texture with id if it does not yet exist.
     * Return it.
     */
    var simulationTexture = (function () {
//        var simulationTextures = [];
        // The real function is returned
        return (function(id) {
            if (!simulationTextures[id]) {
                simulationTextures[id] = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, simulationTextures[id]);
                var res = simulationResolution();
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, res.w, res.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.bindTexture(gl.TEXTURE_2D, null);
            }
            return simulationTextures[id];
        })
    }());


    /**
     * Clear simulation buffers
     */
    function clearSimulationBuffer(id) {
        if (simulationTextures[id]) {
            gl.deleteTexture(simulationTextures[id]);
        }
        if (simulationBuffers[id]) {
            gl.deleteFramebuffer(simulationBuffers[id]);
        }
        
        simulationTextures[id] = null;
        simulationBuffers[id] = null;
    }


    /**
     * Link vertexShader vs and fragmentShader fs to one shader program and return it.
     */
    function createShaderProgram(vs, fs) {
        program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Could not link program");
        }

        return program;
    }


    /**
     * Initialize scene.
     */
    function init(shaders, tex) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        window.onresize = function () {
            canvas.width = Math.ceil(window.innerWidth);
            canvas.height = Math.ceil(window.innerHeight);
            windowChangedSize = true;
        }
        
        // Align top-left
        stats.domElement.style.position = 'fixed';
        stats.domElement.style.left = '0px';
        stats.domElement.style.bottom = '0px';

        //uncomment to view stats.
        //document.body.appendChild( stats.domElement );

        // shasders
        var vs = shaders['vs'];
        var simulation = shaders['simulation'];
        var rendering = shaders['rendering'];
        simulationEnv = new SimulationEnv.SimulationEnv(nSeeds);

        var vj = new VJ.VJ(simulationEnv);
        vj.start();

        simulationProgram = createShaderProgram(vs, simulation);
        renderingProgram = createShaderProgram(vs, rendering);
        textures = tex;

        var squareVB = squareVertexBuffer();

        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        // Attribute & Uniform Locations for simulation
        simulationProgram.squarePositionAttribute = gl.getAttribLocation(simulationProgram, 'aVertexPosition');
        simulationProgram.simulationUniform = gl.getUniformLocation(simulationProgram, 'simulation');
        simulationProgram.referenceUniform = gl.getUniformLocation(simulationProgram, 'reference');
        simulationProgram.timeUniform = gl.getUniformLocation(simulationProgram, 'time');
        simulationProgram.decayUniform = gl.getUniformLocation(simulationProgram, 'decay');

        simulationProgram.scatterUniform = gl.getUniformLocation(simulationProgram, 'scatter');
        simulationProgram.sizeUniform = gl.getUniformLocation(simulationProgram, 'size');
        simulationProgram.positionUniform = gl.getUniformLocation(simulationProgram, 'position');
        simulationProgram.amountUniform = gl.getUniformLocation(simulationProgram, 'amount');

        simulationProgram.windowSizeUniform = gl.getUniformLocation(simulationProgram, 'windowSize');
        simulationProgram.simulationSizeUniform = gl.getUniformLocation(simulationProgram, 'simulationSize');

        gl.enableVertexAttribArray(simulationProgram.squarePositionAttribute);
        gl.enableVertexAttribArray(simulationProgram.textureCoordinatesAttribute);

        // Attribute & Uniform Locations for rendering
        renderingProgram.squarePositionAttribute = gl.getAttribLocation(renderingProgram, 'aVertexPosition');
        renderingProgram.timeUniform = gl.getUniformLocation(renderingProgram, 'time');
        renderingProgram.simulationUniform = gl.getUniformLocation(renderingProgram, 'simulation');

        renderingProgram.windowSizeUniform = gl.getUniformLocation(renderingProgram, 'windowSize');

        renderingProgram.backgroundColorBUniform = gl.getUniformLocation(renderingProgram, 'backgroundColorA');
        renderingProgram.backgroundColorAUniform = gl.getUniformLocation(renderingProgram, 'backgroundColorB');


        gl.enableVertexAttribArray(renderingProgram.squarePositionAttribute);
        gl.enableVertexAttribArray(renderingProgram.textureCoordinatesAttribute);

        startRendering();
    }


    // Load shaders and start the simulation/rendering.
    getShaders({
        vs: 'shaders/vertexShader.vs',
        simulation: 'shaders/simulation.fs',
        rendering: 'shaders/rendering.fs'
    }, function (shaders) {
        getTextures({
            reference: 'images/scream.jpg'
        }, function (textures) {
            init(shaders, textures);
        })
    });
});
