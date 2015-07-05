
var Class    = require("class.extend");
var jsonfile = require("jsonfile");
var util     = require("./util");

// removes extra characters and lowercases; i.e. "F-9!" becomes "f9"
exports.clean = function(acronym) {
  return acronym.replace(/\W/g, "").toLowerCase();
};

exports.acronym_compare = function(a, b) {
  if(a.weight < b.weight) return -1;
  if(a.weight > b.weight) return  1;
  return 0;
};

// a single acronym
exports.Acronym = Class.extend({
  init: function(packed) {

    this.id          = "";

    this.acronyms    = [];
    this.acronym     = "";
    this.initials    = "";
    this.description = "";
    this.author      = "";
    this.source      = "";

    // 0.0 = nobody knows this
    // 0.2 = subsystem-specific term
    // 0.4 = rocket guidance/status
    // 0.6 = rocket subsystem (fts, s1, etc.)
    // 0.6 = other hardware
    // 0.8 = spacex hardware (f9, asds)
    // 1.0 = everybody knows this
    this.weight      = 0;

    this.last_update = 0;
    this.updated_by  = null;

    if(packed) this.unpack(packed);
    
  },

  pack: function() {
    var o = {};
    
    o.id          = this.id;
    o.acronym     = this.acronym;
    o.acronyms    = this.acronyms;
    o.initials    = this.initials;
    o.description = this.description;
    o.weight      = this.weight;
    
    return o;
  },

  unpack: function(o) {
    
    this.id          = o.id;
    this.acronym     = o.acronym;
    this.acronyms    = o.acronyms;
    this.initials    = o.initials;
    this.description = o.description;
    this.weight      = o.weight;

    if(!this.acronym) console.log("empty acronym");
    if(!this.initials) console.log(this.acronym + " empty initials");
    if(!this.description) console.log(this.acronym + " empty description");
    
  },

  updated: function() {
    this.last_update = util.time();
    this.updated_by  = "local";
  },

  // acronym

  has_acronym: function(acronym) {
    if(this.acronyms.indexOf(acronym) >= 0) return true;
    return false;
  },

  // set the "canonical" acronym (i.e. the default one that's printed)
  set_acronym: function(acronym) {
    this.acronym = acronym;
    
    this.add_acronym(acronym);
    
    this.updated();
  },

  add_acronym: function(acronym) {
    if(!this.has_acronym(acronym))
      this.acronyms.push(acronym);
    
    this.updated();
  },

  get_acronym: function() {
    return this.acronym;
  },

  // initials

  set_initials: function(initials) {
    this.initials = initials;
    
    this.updated();
  },
  
  get_initials: function() {
    return this.initials;
  },

  // description

  set_description: function(description) {
    this.description = description;
    
    this.updated();
  },
  
  get_description: function() {
    return this.description;
  },
  
});

// a base class for a list of acronyms
exports.Acronyms = Class.extend({
  init: function() {

    this.acronyms = [];
    
  },

  // get/set

  get: function(acronym, callback) {

    acronym = exports.clean(acronym);

    var matching = [];
    
    for(var i=0; i<this.acronyms.length; i++) {
      var a = this.acronyms[i];
      if(a.acronyms.indexOf(acronym) >= 0) {
        matching.push(a);
      }
    }

    matching.sort(exports.acronym_compare);

    if(callback) {
      callback(null, matching);
    }
    
  },

  updated: function(acronym) {
    
  },

  create: function(callback) {
    var a = new exports.Acronym();
    a.id = this.acronyms.length;
    this.acronyms.push(a);
    
    if(callback) {
      callback(null, a);
    }
  }

});


// JSON acronym list
exports.JSONAcronyms = exports.Acronyms.extend({
  init: function(filename) {
    this._super();

    // acronym filename
    this.filename = filename;
  },

  get_refresh: function(acronym, callback) {
    var acronyms = this;

    this.restore(function() {
      acronyms.get.call(acronyms, acronym, function(err, matches) {
        if(callback) callback(err, matches);
      });
    });

  },

  save: function(callback) {

    var acronyms = this;

    var list = [];
    
    for(var i=0; i<this.acronyms.length; i++) {
      list.push(this.acronyms[i].pack());
    }
    
    jsonfile.writeFile(this.filename, {
      acronyms: list
    }, {
      spaces: 2
    }, function(err, obj) {
      if(err) {
        console.warn("could not save to file '" + acronyms.filename + "'")
        if(callback) callback(err, null);
        return;
      }

      console.log("saved acronyms to '" + acronyms.filename + "'");
      
      if(callback) {
        callback(null, obj);
      }
      
    });
  },

  restore: function(callback) {

    var acronyms = this;

    jsonfile.readFile(this.filename, function(err, obj) {
      
      if(err) {
        if(callback) callback(err, null);
        console.log(err);
        return;
      }

      acronyms.acronyms = [];

      for(var i=0; i<obj.acronyms.length; i++) {
        acronyms.acronyms.push(new exports.Acronym(obj.acronyms[i]));
      }
      
      console.log("restored acronyms from '" + acronyms.filename + "'");
      
      if(callback) callback(null, obj);
      
    });
    
  },

  updated: function(acronym) {
    this.save();
  },

  create: function(callback) {
    
    var acronyms = this;
    
    this._super(function(err, acronym) {
      acronyms.save();

      if(callback) callback.call(acronyms, err, acronym);
    });
    
  }

});

