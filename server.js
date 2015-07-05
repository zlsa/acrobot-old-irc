
var irc      = require("irc");
var Class    = require("class.extend");
var jsonfile = require("jsonfile");
var nlp      = require("./nlp");
var acrs     = require("./acronyms");
var util     = require("./util");
var phrases  = require("./phrases");

exports.CONFIG_VERSION = 1;

exports.is_valid_nick = function(nick) {
  var valid = new RegExp(/^[A-Za-z0-9_\-]+$/).test(nick);
  return valid;
};

exports.is_valid_channel = function(channel) {
  var valid = new RegExp(/^\#[A-Za-z0-9_\-]+$/).test(channel);
  return valid;
};

exports.Server = Class.extend({
  init: function(acronyms, filename) {

    // these are defaults ONLY! they will be overwritten by config.json
    this.irc = {
      nick:      "acrobotic",
      server:    "irc.esper.net",
      channels: ["#acrobot"],
    };
      
    this.users = {
      // "zlsa": {
      //   admin:  false,
      //   ignore: false
      // }
    };

    this.mode = {
      debug: true,
      cheeky: false,
      silent: false,
      auto_refresh: false
    };

    this.mode_cooldown = {};

    // acronyms
    this.acronyms = acronyms;

    // config filename
    this.filename = filename || "config.json";

  },

  // save/restore

  save: function(callback) {
    var server = this;
    
    jsonfile.writeFile(this.filename, {
      version: exports.CONFIG_VERSION,
      irc:     this.irc,
      users:   this.users,
      mode:    this.mode
    }, {
      spaces: 2
    }, function(err, obj) {
      if(err) {
        console.warn("could not save to file '" + server.filename + "'")
        return;
      }

      console.log("saved config to '" + server.filename + "'");
      
      if(callback) callback();
      
    });
  },

  restore: function(callback) {
    var server = this;

    jsonfile.readFile(this.filename, function(err, obj) {
      
      if(err) {
        console.log("could not open config file '" + server.filename + "'");
        // file doesn't exist yet, create it with the above defaults
        server.save();
        callback(null);
        return;
      }

      if(obj.version != exports.CONFIG_VERSION) {
        console.log("config file '" + server.filename + "' is older version");
        server.save();
        callback(null);
        return;
      }

      server.irc   = obj.irc;
      server.users = obj.users;
      server.mode  = obj.mode;
      
      console.log("restored config from '" + server.filename + "'");
      
      if(callback) callback(obj);
      
    });
  },

  // IRC connection

  connect: function(callback) {

    if(!this.bot) {
      this.bot = new irc.Client(this.irc.server, this.irc.nick, {
        channels: this.irc.channels,

        userName: this.irc.nick,
        realName: "Acrobot",
        autoConnect: false,
      });

      this.bind_irc_events();

    }

    var server = this;
    this.bot.connect(5, function() {
      if(callback) callback();
    });
  },

  disconnect: function(callback) {
    this.bot.disconnect(callback);
    console.log("disconnected from irc server");
  },

  notice: function(to, message) {
    this.bot.notice(to, message);
  },

  direct: function(sender, all, message) {
    if(sender == all)
      this.say(sender, message);
    else
      this.notice(sender, message);
  },

  all: function(all, message) {
    this.say(all, message);
  },

  say: function(to, message) {
    this.bot.say(to, message);
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

  join_channel: function(channel) {
    if(this.irc.channels.indexOf(channel) >= 0) {
      return false;
    }
    
    this.bot.join(channel);
    this.irc.channels.push(channel);

    this.save();
    
    return true;
  },

  part_channel: function(channel) {
    channel = channel.toLowerCase();
    if(this.irc.channels.indexOf(channel) < 0) {
      return false;
    }

    this.bot.part(channel);
    
    this.save();
    
    return true;
  },

  // mode

  is_valid_mode: function(mode) {
    var valid_modes = [
      "debug",
      "cheeky",
      "silent",
      "auto_refresh"
    ];
    
    if(valid_modes.indexOf(mode) >= 0) return true;
    return false;
  },

  set_mode: function(mode, value) {
    this.mode[mode] = value;

    this.save();
  },

  mode_enabled: function(mode) {
    if(this.mode[mode]) return true;
    return false;
  },

  mode_is: function(mode) {
    if(this.mode_enabled(mode)) {
      if(this.mode_cooldown[mode] && this.mode_cooldown[mode] > util.time()) return false;
      return true;
    }
    return false;
  },

  use_mode: function(mode) {
    var delay = -1;
    if(mode == "cheeky") delay = 5;
    this.mode_cooldown[mode] = util.time() + delay;
  },

  mode_message: function(mode, message, to) {
    if(this.mode_is(mode)) {
      this.use_mode(mode);
      this.say(to, phrases.get(message));
    }
  },

  // users

  user_is: function(nick, status) {
    if(nick in this.users) {
      return this.users[nick][status];
    } else {
      return false;
    }
  },

  user_set: function(nick, status, value) {
    if(!(nick in this.users)) {
      this.users[nick] = {};
    }

    this.users[nick][status] = value;

    this.save();
  },

  users_get: function(status, value) {
    var users = [];
    
    for(var i in this.users) {
      var u = this.users[i];
      if(this.user_is(i, status) == value) users.push(i);
    }
    
    return users;
  },

  print_acronyms: function(acronyms, to, description, always) {
    if(description == undefined) description = true;
    
    var server = this;

    var got_acronyms = []; // avoid printing out duplicates

    for(var i=0; i<acronyms.length; i++) {

      var acronym = acrs.clean(acronyms[i]);

      if(got_acronyms.indexOf(acronym) >= 0) continue;
      got_acronyms.push(acronym);

      var get = this.acronyms.get;
      
      if(this.mode_is("auto_refresh")) {
        get = this.acronyms.get_refresh;
      }
    
      get.call(this.acronyms, acronym, function(err, matches) {
        
        if(matches.length >= 1) {
          var reply = [];
          for(var i=0; i<matches.length; i++) {
            var a = matches[i];

            var s = "";
            s += a.get_acronym() + ": ";
            if(a.get_initials()) {
              s += a.get_initials();
            }
            if(description && a.get_description()) {
              if(a.get_initials()) s += ". ";
              s += a.get_description();
            }

            reply.push(s);
          }
          
          server.say(to, reply.join(", "));
        } else if(always) {
          server.say(to, "could not find an acronym matching '" + acronym + "'");
        }
        
      });

    }
    
  },

  // parsing

  parse_what: function(cfn, all) {

    if(cfn.subjects.length <= 0) {
      this.mode_message("cheeky", "incomplete-short-sentence", all);
      return false;
    }

    this.print_acronyms(cfn.subjects, all);

    return true;
    
  },

  parse_natural: function(sender, all, message) {
    var cfn = nlp.classify(this.irc.nick, message);

    if(cfn.action == "what") {
      return this.parse_what(cfn, all);
    }

    return false;
    
  },

  command_quit: function(sender, all, message) {
    if(this.user_is(sender, "admin"))
      this.disconnect();
    else
      this.direct(sender, all, "you're not an admin!");
  },

  command_restart: function(sender, all, message) {
    if(this.user_is(sender, "admin"))
      process.exit();
    else
      this.direct(sender, all, "you're not an admin!");
  },

  // USER FUNCTIONS (ADMIN)

  command_admin: function(sender, all, message) {
    if(!message) {
      this.direct(sender, all, "expected additional arguments to 'admin'");
      return;
    }
    
    var type = message.split(" ")[0].toLowerCase();
    var args = message.substr(type.length + 1);

    if(type == "list") {
      this.command_list_admins(sender, all, args);
    } else if(type == "add") {
      this.command_add_admin(sender, all, args);
    } else if(type == "remove") {
      this.command_remove_admin(sender, all, args);
    } else {
      this.direct(sender, all, "expected one of [list, add, remove]");
    }

  },

  command_list_admins: function(sender, all, message) {
    var users = this.users_get("admin", true);

    if(users.length == 0) {
      this.all(all, "none found");
    } else {
      this.all(all, nlp.andify(users));
    }
  },

  command_add_admin: function(sender, all, nick) {
    if(!this.user_is(sender, "admin")) {
      this.direct(sender, all, "you're not an admin!");
      return;
    }
    
    if(!nick) {
      this.direct(sender, all, "expected a nick to add as admin");
      return;
    }
    
    if(!exports.is_valid_nick(nick)) {
      this.direct(sender, all, "invalid nick '" + nick + "'");
      return;
    }

    if(this.user_is(nick, "admin")) {
      this.direct(sender, all, "'" + nick + "' is already an admin");
      return;
    }
    
    this.user_set(nick, "admin", true);
    
    this.direct(sender, all, "'" + nick + "' is now an admin");
  },

  command_remove_admin: function(sender, all, nick) {
    if(!this.user_is(sender, "admin")) {
      this.direct(sender, all, "you're not an admin!");
      return;
    }
    
    if(!nick) {
      this.direct(sender, all, "expected a nick to remove as admin");
      return;
    }
    
    if(!exports.is_valid_nick(nick)) {
      this.direct(sender, all, "invalid nick '" + nick + "'");
      return;
    }

    if(nick == sender) {
      this.direct(sender, all, "you can't remove yourself as an admin");
      return;
    }
    
    if(!this.user_is(nick, "admin")) {
      this.direct(sender, all, "'" + nick + "' already isn't an admin");
      return;
    }

    this.user_set(nick, "admin", false);
    this.direct(sender, all, "'" + nick + "' is no longer an admin");
  },

  // USER FUNCTIONS (IGNORE)

  command_list_ignored: function(sender, all, message) {
    var users = this.users_get("ignored", true);

    if(users.length == 0) {
      this.direct(sender, all, "none found");
    } else {
      this.direct(sender, all, nlp.andify(users));
    }
  },

  command_add_ignore: function(sender, all, nick) {
    if(!this.user_is(sender, "admin")) {
      this.direct(sender, all, "you're not an admin!");
      return;
    }
    
    if(!nick) {
      this.direct(sender, all, "expected a nick to add to ignore list");
      return;
    }
    
    if(!exports.is_valid_nick(nick)) {
      this.direct(sender, all, "invalid nick '" + nick + "'");
      return;
    }

    if(nick == sender) {
      this.direct(sender, all, "you can't ignore yourself");
      return;
    }
    
    if(this.user_is(nick, "ignored")) {
      this.direct(sender, all, "'" + nick + "' is already ignored");
      return;
    }
    
    this.user_set(nick, "ignored", true);
    
    this.direct(sender, all, "'" + nick + "' is now ignored");
  },

  command_remove_ignore: function(sender, all, nick) {
    if(!this.user_is(sender, "admin")) {
      this.direct(sender, all, "you're not an admin!");
      return;
    }
    
    if(!nick) {
      this.direct(sender, all, "expected a nick to remove from ignore list");
      return;
    }
    
    if(!exports.is_valid_nick(nick)) {
      this.direct(sender, all, "invalid nick '" + nick + "'");
      return;
    }

    if(!this.user_is(nick, "ignored")) {
      this.direct(sender, all, "'" + nick + "' already isn't ignored");
      return;
    }

    this.user_set(nick, "ignored", false);
    this.direct(sender, all, "'" + nick + "' is no longer ignored");
  },

  // CHANNEL FUNCTIONS

  command_channel: function(sender, all, message) {
    var type = message.split(" ")[0].toLowerCase();
    var args = message.substr(type.length + 1);

    if(type == "join") {
      this.command_add_channel(sender, all, args);
    } else if(type == "part") {
      this.command_remove_channel(sender, all, args);
    } else if(type == "list") {
      this.command_list_channels(sender, all, args);
    } else {
      this.direct(sender, all, "expected one of [join, part, list]");
    }

  },

  command_list_channels: function(sender, all, message) {
    this.all(all, nlp.andify(this.irc.channels));
  },

  command_add_channel: function(sender, all, channel) {
    if(!this.user_is(sender, "admin")) {
      this.direct(sender, all, "you're not an admin!");
      return;
    }
    
    if(!exports.is_valid_channel(channel)) {
      this.direct(sender, all, "invalid channel name '" + channel + "'");
      return;
    }

    if(!this.join_channel(channel)) {
      this.direct(sender, all, "already joined " + channel);
      return;
    }
    
    this.all(all, "joined " + channel);
  },

  command_remove_channel: function(sender, all, channel) {
    if(!this.user_is(sender, "admin")) {
      this.direct(sender, all, "you're not an admin!");
      return;
    }
    
    if(!channel) {
      if(all[0] == "#") {
        channel = all;
      } else {
        this.direct(sender, all, "cannot part from private chat");
        return;
      }
    }
    
    if(!exports.is_valid_channel(channel)) {
      this.direct(sender, all, "invalid channel name '" + channel + "'");
      return;
    }

    if(this.irc.channels.length == 1) {
      this.direct(sender, all, "cannot part last channel");
      return;
    }

    if(!this.part_channel(channel)) {
      this.direct(sender, all, "already parted " + channel);
      return;
    }
    
    this.direct(sender, all, "parted " + channel);
  },

  // ADD FUNCTION

  command_list: function(sender, all, message) {
    if(!message) {
      this.direct(sender, all, "expected additional arguments to 'list'");
      return;
    }
    
    var type = message.split(" ")[0].toLowerCase();
    var args = message.substr(type.length + 1);

    if(type == "admin" || type == "admins") {
      this.command_list_admins(sender, all, args);
    } else if(type == "ignore" || type == "ignored") {
      this.command_list_ignored(sender, all, args);
    } else if(type == "channel" || type == "channels") {
      this.command_list_channels(sender, all, args);
    } else {
      this.direct(sender, all, "expected one of [admins, ignored, channels]");
    }

  },

  command_add: function(sender, all, message) {
    if(!message) {
      this.direct(sender, all, "expected additional arguments to 'add'");
      return;
    }
    
    var type = message.split(" ")[0].toLowerCase();
    var args = message.substr(type.length + 1);

    if(type == "admin") {
      this.command_add_admin(sender, all, args);
    } else if(type == "ignore") {
      this.command_add_ignore(sender, all, args);
    } else if(type == "channel") {
      this.command_add_channel(sender, all, args);
    } else {
      this.direct(sender, all, "expected one of [admin, ignore, channel]");
    }

  },

  command_remove: function(sender, all, message) {
    if(!message) {
      this.direct(sender, all, "expected additional arguments to 'remove'");
      return;
    }
    
    var type = message.split(" ")[0].toLowerCase();
    var args = message.substr(type.length + 1);

    if(type == "admin") {
      this.command_remove_admin(sender, all, args);
    } else if(type == "ignore") {
      this.command_remove_ignore(sender, all, args);
    } else if(type == "channel") {
      this.command_remove_channel(sender, all, args);
    } else {
      this.direct(sender, all, "expected one of [admin, ignore, channel]");
    }

  },

  command_mode: function(sender, all, message) {
    if(!message) {
      this.direct(sender, all, "expected two arguments to 'mode'");
      return;
    }
    
    var args = message.toLowerCase().split(/\s+/);

    if(args.length != 1 && args.length != 2) {
      this.direct(sender, all, "expected one or two arguments to 'mode'");
      return;
    }

    var value = true;

    if(args.length == 2) {
      if(args[1] == "true"    ||
         args[1] == "on"      ||
         args[1] == "enabled") {
        value = true;
      } else if(args[1] == "false"    ||
                args[1] == "off"      ||
                args[1] == "disabled") {
        value = false;
      } else {
        this.direct(sender, all, "expected second argument to be 'true' or 'false'");
        return;
      }
    }

    var mode = args[0];

    if(this.is_valid_mode(mode)) {
      var old_value = this.mode_enabled(mode);
      if(old_value == value) {
        this.direct(sender, all, "'" + mode + "' is already " + old_value);
      } else {
        this.set_mode(mode, value);
        this.direct(sender, all, "'" + mode + "' is now " + this.mode_enabled(mode));
      }
    } else {
      this.direct(sender, all, "invalid mode '" + mode + "'");
      return;
    }

  },

  command_define: function(sender, all, message) {
    if(!message) {
      this.direct(sender, all, "expected acronym(s)");
      return;
    }
    
    var acronyms = nlp.split_acronyms(message.toLowerCase());

    this.print_acronyms(acronyms, all, true, true);

  },

  command_say: function(sender, all, message) {
    if(!this.user_is(sender, "admin")) {
      this.direct(sender, all, "you're not an admin!");
      return;
    }
    
    if(!message) {
      this.direct(sender, all, "expected channel and message");
      return;
    }
    
    var channel = message.split(" ")[0].toLowerCase();
    var msg = message.substr(channel.length + 1);

    this.say(channel, msg);

  },

  command: function(sender, all, command, message) {
    
    if(command == "quit" || command == "disconnect" || command == "leave") {
      this.command_quit(sender, all, message);
    } else if(command == "restart") {
      this.command_restart(sender, all, message);
      
    } else if(command == "define") {
      this.command_define(sender, all, message);
      
    } else if(command == "list") {
      this.command_list(sender, all, message);
      
    } else if(command == "admin") {
      this.command_admin(sender, all, message);
      
    } else if(command == "admins") {
      this.command_list_admins(sender, all, message);
      
    } else if(command == "channels") {
      this.command_list_channels(sender, all, message);
      
    } else if(command == "channel") {
      this.command_channel(sender, all, message);
      
    } else if(command == "add") {
      this.command_add(sender, all, message);
    } else if(command == "remove") {
      this.command_remove(sender, all, message);
      
    } else if(command == "ignore") {
      this.command_add_ignore(sender, all, message);
    } else if(command == "unignore") {
      this.command_remove_ignore(sender, all, message);
      
    } else if(command == "join") {
      this.command_add_channel(sender, all, message);
    } else if(command == "part") {
      this.command_remove_channel(sender, all, message);
      
    } else if(command == "silence") {
      this.command_mode(sender, all, "silent on");
      
    } else if(command == "unsilence") {
      this.command_mode(sender, all, "silent off");
      
    } else if(command == "say") {
      this.command_say(sender, all, message);
      
    } else if(command == "mode") {
      this.command_mode(sender, all, message);
    } else {
      this.notice(sender, "unknown command '" + command + "'");
    }
  },
        
  parse_command: function(sender, all, message) {

    if(!message) {
      this.notice(from, "expected a command");
      return;
    }

    var command = message.split(" ")[0].toLowerCase();

    this.command(sender, all, command, message.substr(command.length + 1));

  },
  
  parse_message: function(from, to, message) {

    if(from == this.irc.nick)
      return;

    if(this.user_is(from, "ignored"))
      return;

    var sender = from;
    var all    = to;

    var server = this;
    
    message = message.trim();

    var type   = "natural";
    var direct = false;

    if(to == this.irc.nick) direct = true;
    
    if(message.indexOf(this.irc.nick) == 0) {
      type = "command";
      var first_space = message.indexOf(" ");
      
      if(first_space <= 0) {
        message = "";
      } else {
        message = message.substr(first_space + 1);
      }
    }

    if(type == "natural") {
      if(this.mode_is("silent"))
        return;
      this.parse_natural(sender, all, message);
    }

    if(direct || type == "command") {
      if(direct)
        all = sender;
      this.parse_command(sender, all, message);
    }

  }
  
});
