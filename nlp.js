
function escape_regexp(string) {
  return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

function replace_all(string, find, replace) {
  return string.replace(new RegExp(escape_regexp(find), "g"), replace);
}

exports.andify = function(list) {
  if(list.length == 0) {
    return "";
  } else if(list.length == 1) {
    return list[0];
  } else {
    var s = "";
    s += list.slice(0, list.length-1).join(", ");
    s = s.substr(0, s.length);
    if(list.length > 2) s += ",";
    s += " and " + list[list.length-1];
    return s;
  }
};

exports.split_acronyms = function(text) {
  return text.split(/\s+|and/g);
};

exports.preprocess = function(text) {
  var string = replace_all(text, "'s", " is").toLowerCase();
  string = replace_all(string, "?", "");
  
  var words  = string.split(/\s+/g);
  
  return words;
};

exports.classify_what = function(me, words) {
  var cfn = {};
  cfn.action = "what";
  
  var offset = 1;
  
  if((words[1] == "is" || words[1] == "are") && words.length >= 2) offset += 1;
  if(offset == 2 && (words[2] == "the" || words[2] == "a" || words[2] == "an") && words.length >= 3) offset += 1;

  var subjects = exports.split_acronyms(words.slice(offset).join(" "));

  cfn.subjects = [];
  
  for(var i=0; i<subjects.length; i++) {
    if(subjects[i]) cfn.subjects.push(subjects[i]);
  }
  
  return cfn;
};

exports.classify = function(me, text) {
  words = exports.preprocess(text);

  if(words.length >= 1) {

    if(words[0] == "what") {
      return exports.classify_what(me, words);
    }
  }

  return {};

};
