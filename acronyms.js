
var Class    = require("class.extend");

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

    this.acronyms    = [];
    this.meaning     = "";
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
    
  }
});

// a base class for a list of acronyms
exports.Acronyms = Class.extend({
  init: function() {

    this.acronyms = [];
    
  },

  get: function(acronym) {

    acronym = exports.clean(acronym);

    var matching = [];
    
    for(var i=0; i<this.acronyms.length; i++) {
      var a = this.acronyms[i];
      if(a.acronyms.indexOf(acronym) >= 0) {
        matching.append(a);
      }
    }

    matching.sort(exports.acronym_compare);

    return matching;
    
  },

  add: function(acronym) {
    this.acronyms.push(acronym);
  },

  new: function(acronym) {
    this.acronyms.push(acronym);
  }

});

