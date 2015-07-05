
function escape_regexp(string) {
  return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

function replace_all(string, find, replace) {
  return string.replace(new RegExp(escape_regexp(find), "g"), replace);
}

exports.preprocess = function(text) {
  var string = replace_all(text, "'s", " is").toLowerCase();
  string = replace_all(string, "?", "");
  
  var words  = string.split(/\s+/g);
  
  return words;
};

exports.classify = function(text) {
  words = exports.preprocess(text);

  if(words.length >= 2) {

    if(words[0] == "what") {
      var cfn = {};
      cfn.action = "what";
      
      var offset = 1;
      
      if((words[1] == "is" || words[1] == "are") && words.length >= 3) offset += 1;
      if(offset == 2 && words[2] == "the" && words.length >= 4) offset += 1;

      cfn.subjects = words.slice(offset).join(" ").split(/\s+|and/g);
      
      return cfn;
    }
  }

  return {};

};
