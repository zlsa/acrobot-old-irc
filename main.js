
var Server   = require("./server").Server;
var acronyms = require("./acronyms");

var ja       = new acronyms.JSONAcronyms("acronyms.json");
var server   = new Server(ja);

ja.create(function(err, acronym) {
  acronym.set_acronym("fts");
  acronym.set_initials("Flight Termination System");
  acronym.set_description("When a launch vehicle departs from its planned trajectory, the flight termination system is used to destroy the rocket to prevent damage to people or assets.");

  this.updated();
});

server.restore(function() {
  
  server.connect(function() {
    console.log("connected to irc server");
  });
  
});
