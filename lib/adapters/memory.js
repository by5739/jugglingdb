exports.initialize = function initializeSchema(schema, callback) {
    schema.adapter = new Memory();
    process.nextTick(callback);
};

function Memory() {
    this._models = {};
    this.cache = {};
    this.ids = {};
}

Memory.prototype.define = function defineModel(descr) {
    var m = descr.model.modelName;
    this._models[m] = descr;
    this.cache[m] = {};
    this.ids[m] = 1;
};

Memory.prototype.create = function create(model, data, callback) {
    var id = data.id || this.ids[model]++;
    data.id = id;
    this.cache[model][id] = data;
    callback(null, id);
};

Memory.prototype.updateOrCreate = function (model, data, callback) {
    var mem = this;
    this.exists(model, data.id, function (err, exists) {
        if (exists) {
            mem.save(model, data, callback);
        } else {
            mem.create(model, data, function (err, id) {
                data.id = id;
                callback(err, data);
            });
        }
    });
};

Memory.prototype.save = function save(model, data, callback) {
    this.cache[model][data.id] = data;
    callback(null, data);
};

Memory.prototype.exists = function exists(model, id, callback) {
    callback(null, this.cache[model].hasOwnProperty(id));
};

Memory.prototype.find = function find(model, id, callback) {
    callback(null, this.cache[model][id]);
};

Memory.prototype.destroy = function destroy(model, id, callback) {
    delete this.cache[model][id];
    callback();
};

Memory.prototype.all = function all(model, filter, callback) {
    var nodes = Object.keys(this.cache[model]).map(function (key) {
        return this.cache[model][key];
    }.bind(this));

    if (filter) {

        // do we need some filtration?
        if (filter.where) {
            nodes = nodes ? nodes.filter(applyFilter(filter)) : nodes;
        }

        // do we need some sorting?
        if (filter.order) {
            var props = this._models[model].properties;
            var allNumeric = true;
            var orders = filter.order;
            var reverse = false;
            if (typeof filter.order === "string") {
                orders = [filter.order];
            }
            orders.forEach(function (key, i) {
                var m = key.match(/\s+(A|DE)SC$/i);
                if (m) {
                    key = key.replace(/\s+(A|DE)SC/i, '');
                    if (m[1] === 'DE') reverse = true;
                }
                orders[i] = key;
                if (props[key].type.name !== 'Number' && props[key].type.name !== 'Date') {
                    allNumeric = false;
                }
            });
            if (allNumeric) {
                nodes = nodes.sort(numerically.bind(orders));
            } else {
                nodes = nodes.sort(literally.bind(orders));
            }
            if (reverse) nodes = nodes.reverse();
        }
    }

    process.nextTick(function () {
        callback(null, nodes);
    });

    function numerically(a, b) {
        return a[this[0]] - b[this[0]];
    }

    function literally(a, b) {
        return a[this[0]] > b[this[0]];
    }
};

function applyFilter(filter) {
    if (typeof filter.where === 'function') {
        return filter.where;
    }
    var keys = Object.keys(filter.where);
    return function (obj) {
        var pass = true;
        keys.forEach(function (key) {
            if (!test(filter.where[key], obj[key])) {
                pass = false;
            }
        });
        return pass;
    }

    function test(example, value) {
        if (typeof value === 'string' && example && example.constructor.name === 'RegExp') {
            return value.match(example);
        }
        // not strict equality
        return example == value;
    }
}

Memory.prototype.destroyAll = function destroyAll(model, callback) {
    Object.keys(this.cache[model]).forEach(function (id) {
        delete this.cache[model][id];
    }.bind(this));
    this.cache[model] = {};
    callback();
};

Memory.prototype.count = function count(model, callback, where) {
    var cache = this.cache[model];
    var data = Object.keys(cache)
    if (where) {
        data = data.filter(function (id) {
            var ok = true;
            Object.keys(where).forEach(function (key) {
                if (cache[id][key] != where[key]) {
                    ok = false;
                }
            });
            return ok;
        });
    }
    callback(null, data.length);
};

Memory.prototype.updateAttributes = function updateAttributes(model, id, data, cb) {
    data.id = id;
    var base = this.cache[model][id];
    this.save(model, merge(base, data), cb);
};

function merge(base, update) {
    if (!base) return update;
    Object.keys(update).forEach(function (key) {
        base[key] = update[key];
    });
    return base;
}

