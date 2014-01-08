var Splat = function (spec) {
    this.startPosition = {
        x: spec.startPosition.x,
        y: spec.startPosition.y
    }
    this.maxSize = spec.maxSize;
    this.velocity = {
        x: spec.velocity.x,
        y: spec.velocity.y
    };
    this.duration = spec.duration;
    this.totalAmount = spec.totalAmount;
    this.size = spec.size;
    this.scatter = spec.scatter;
    this.framesLeft = this.duration;
}


Splat.prototype.emit = function () {
    var currentFrame = this.duration - this.framesLeft;
    var scatter = this.scatter;
    var size = this.size;
    var position = {
        x: this.startPosition.x + this.velocity.x*currentFrame,
        y: this.startPosition.y + this.velocity.y*currentFrame,
    };
    var amount = this.totalAmount / this.duration;
    this.framesLeft--;

    return {
        scatter: scatter, 
        size: size,
        position: position,
        amount: amount
    };
}


Splat.prototype.hasFinished = function () {

    return this.framesLeft < 1;
}

exports.Splat = Splat;
