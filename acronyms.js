
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
  init: function() {

    this.id          = "";

    this.acronyms    = [];
    this.acronym     = "";
    this.initials    = "";
    this.description = "";
    this.author      = "";
    this.author_type = "none";
    this.source      = "";
    this.source_type = "none";

    // 0.0 = nobody knows this
    // 0.2 = subsystem-specific term
    // 0.6 = rocket subsystem (fts, s1, etc.)
    // 1.0 = everybody knows this
    this.weight      = 0;

    this.last_update = 0;
    this.updated_by  = null;
    
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
    return this.acronym.toUpperCase();
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
  }
  
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

    this.save();
  },

  save: function(callback) {

    var acronyms = this;
    
    jsonfile.writeFile(this.filename, this.acronyms, {
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

  restore: function() {

    var acronyms = this;

    jsonfile.readFile(this.filename, function(err, obj) {
      
      if(err) {
        if(callback) callback(err, null);
        return;
      }

      acronyms.acronyms = obj;
      
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

