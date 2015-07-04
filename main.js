
var Server   = require("./server").Server;

var server   = new Server();

server.restore(function() {
  
  server.connect(function() {
    console.log("connected to irc server");
  });
  
});
