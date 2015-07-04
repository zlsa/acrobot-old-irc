
var irc      = require("irc");
var Class    = require("class.extend");
var jsonfile = require("jsonfile");

exports.Acrobot = Class.extend({
  init: function(filename) {

    // these are defaults ONLY! they will be overwritten by config.json
    this.irc = {
      nick:      "acrobot",
      server:    "irc.esper.net",
      channels: ["#acrobot"],
    };
      
    this.users = {
      "zlsa": {
        admin:  false,
        ignore: false
      }
    };

    this.filename = filename || "config.json";

  },

  // save/restore

  save: function(callback) {
    var config = this;
    
    jsonfile.writeFile(this.filename, {
      irc: this.irc,
      users: this.users
    }, {
      spaces: 2
    }, function(err, obj) {
      if(err) {
        console.warn("could not save to file '" + config.filename + "'")
        return;
      }
      
      if(callback) callback();
      
    });
  },

  restore: function(callback) {
    var config = this;

    jsonfile.readFile(this.filename, function(err, obj) {
      
      if(err) {
        // file doesn't exist yet, create it with the above defaults
        config.save();
        return;
      }

      config.irc   = obj.irc;
      config.users = obj.users;
      
      if(callback) callback(obj);
      
    });
  }
  
});

