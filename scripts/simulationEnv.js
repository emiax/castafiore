//(function () {

var SimulationEnv = function (nSeeds) {
    this.nSeeds = nSeeds;
    this.splats = [];
    this.frameIndex = 0;
    
    this.backgroundColorA({
        r: 0, g: 0, b: 0
    });

    this.backgroundColorB({
        r: 0, g: 0, b: 0
    });
    
}


SimulationEnv.prototype.splat = function (splat) {
    this.splats.push(splat);
};


SimulationEnv.prototype.textureUrl = function (url) {
    if (url !== undefined) {
        this.texture = url;
    }
    return this.texture;
}


SimulationEnv.prototype.removeFinishedSplats = function () {
    var i = 0, j = 0;
    var splats = this.splats;
    for (i = 0; i < splats.length; i++) {
        if (splats[i] && !splats[i].hasFinished()) {
            splats[j++] = splats[i];
        }
    }
    splats.length = j;
};


SimulationEnv.prototype.emit = function () {
    this.removeFinishedSplats();

    var seeds = new Array(nSeeds);
    var nSeeds = this.nSeeds;

    var i = 0;

    i = 0;
    this.splats.forEach(function (splat) {
        if (i >= nSeeds) {
            return;
        }
        var seed = splat.emit();
        seeds[i] = seed;
        i++;
    });
    this.frameIndex++;
    return seeds;
};

SimulationEnv.prototype.decay = function () {
    return this.frameIndex % 20 === 0 ? 1/255 : 0;
}


SimulationEnv.prototype.backgroundColorA = function (color) {
    if (color !== undefined) {
        this.bgA = color;
    }
    return this.bgA;
};


SimulationEnv.prototype.backgroundColorB = function (color) {
    if (color !== undefined) {
        this.bgB = color;
    }
    return this.bgB;
};


exports.SimulationEnv = SimulationEnv;


//});
