
var irc      = require("irc");
var Class    = require("class.extend");
var jsonfile = require("jsonfile");
var nlp      = require("./nlp");
var acrs     = require("./acronyms");
var util     = require("./util");
var phrases  = require("./phrases");

exports.CONFIG_VERSION = 1;

exports.Server = Class.extend({
  init: function(acronyms) {

    // these are defaults ONLY! they will be overwritten by config.json
    this.irc = {
      nick:      "acrobotic",
      server:    "irc.esper.net",
      channels: ["#acrobot"],
    };
      
    this.users = {
      "zlsa": {
        admin:  false,
        ignore: false
      }
    };

    this.mode = {
      debug: false,
      cheeky: false
    };

    this.cooldown = {};

    // acronyms
    this.acronyms = acronyms;

    // config filename
    this.filename = "config.json";

    // IRC server
    this.bot = new irc.Client(this.irc.server, this.irc.nick, {
      channels: this.irc.channels,

      userName: this.irc.nick,
      realName: "Acrobot",
      autoConnect: false,
    });

    this.bind_irc_events();

  },

  // save/restore

  save: function(callback) {
    var server = this;
    
    jsonfile.writeFile(this.filename, {
      irc:   this.irc,
      users: this.users,
      mode:  this.mode
    }, {
      spaces: 2
    }, function(err, obj) {
      if(err) {
        console.warn("could not save to file '" + server.filename + "'")
        return;
      }
      
      if(callback) callback();
      
    });
  },

  restore: function(callback) {
    var server = this;

    jsonfile.readFile(this.filename, function(err, obj) {
      
      if(err) {
        // file doesn't exist yet, create it with the above defaults
        server.save();
        return;
      }

      if(server.version != exports.CONFIG_VERSION) {
        callback(null);
        return;
      }

      server.irc   = obj.irc;
      server.users = obj.users;
      server.mode  = obj.mode;
      
      if(callback) callback(obj);
      
    });
  },

  // IRC connection

  connect: function(callback) {
    var server = this;
    this.bot.connect(5, function() {
      if(callback) callback();
    });
  },

  notice: function(to, message) {
    this.bot.notice(to, message);
  },

  bind_irc_events: function() {
    var server = this;
    
    this.bot.addListener("message", function (from, to, message) {
      server.parse_message.call(server, from, to, message);
    });
    
    this.bot.addListener("notice", function (nick, to, message) {
      if(nick != undefined)
        server.parse_message.call(server, nick, to, message);
    });
    
  },

  // mode

  enabled: function(mode) {
    if(this.mode[mode]) return true;
    return false;
  },

  is: function(mode) {
    if(this.enabled(mode)) {
      if(this.cooldown[mode] && this.cooldown[mode] > util.time()) return false;
      return true;
    }
    return false;
  },

  use: function(mode) {
    var delay = 1;
    if(mode == "cheeky") delay = 5;
    this.cooldown[mode] = util.time() + delay;
  },

  mode_message: function(mode, message) {
    if(this.is(mode)) {
      this.use(mode);
      this.notice(to, phrases.get(message));
    }
  },

  // parsing

  parse_what: function(cfn, to) {

    if(cfn.subjects.length <= 0) {
      this.cheeky_error("incomplete-short-sentence");
      return;
    }

    var server = this;
    
    var got_acronyms = []; // avoid printing out duplicates

    for(var i=0; i<cfn.subjects.length; i++) {

      var acronym = acrs.clean(cfn.subjects[i]);

      if(got_acronyms.indexOf(acronym) >= 0) continue;
      got_acronyms.push(acronym);
      
      this.acronyms.get(acronym, function(err, matches) {
        
        if(matches.length >= 1) {
          var reply = [];
          for(var i=0; i<matches.length; i++) {
            var a = matches[i];
            reply.push(a.get_acronym() + ": " + a.get_initials());
          }
          
          server.notice(to, reply.join(", "));
        }
        
      });

    }

  },
        
  parse_message: function(from, to, message) {

    var server = this;
    
    if(from == this.irc.nick) return;

    var cfn = nlp.classify(message);

    this.notice("zlsa", JSON.stringify(cfn));

    if(cfn.action == "what") {
      this.parse_what(cfn, to);
    }
    
  }
  
});

