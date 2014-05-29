let {Cc, Ci} = require("chrome");
let utils = require('api-utils/window-utils');
const nsIFilePicker = Ci.nsIFilePicker;

module.exports = Object.create({},{
  // constants: dialog modes
  "modeOpen": { value:0, writable:false, enumerable:true },
  "modeSave":{value: 1, writable:false, enumerable: true},
  "modeGetFolder":{value: 2, writable:false, enumerable: true},
  "modeOpenMultiple":{value: 3, writable:false, enumerable: true},
  // constants: return value
  "returnOK": {value: 	0, writable: false, enumerable: true},
  "returnCancel": {value: 	1, writable: false, enumerable: true},
  "returnReplace": {value: 	2, writable: false, enumerable: true},
  // constants: predefined filters
  "filterAll": {value: 	0x001, writable: false, enumerable: true},
  "filterHTML": {value: 	0x002, writable: false, enumerable: true},
  "filterText": {value: 	0x004, writable: false, enumerable: true},
  "filterImages": {value: 	0x008, writable: false, enumerable: true},
  "filterXML": {value: 	0x010, writable: false, enumerable: true},
  "filterXUL": {value: 	0x020, writable: false, enumerable: true},
  "filterApps": {value: 	0x040, writable: false, enumerable: true},
  "filterAllowURLs": {value: 	0x80, writable: false, enumerable: true},
  "filterAudio": {value: 	0x100, writable: false, enumerable: true},
  "filterVideo": {value: 	0x200, writable: false, enumerable: true}
});
  // exported function
  /*
   * parameters:
   * mode: one of the file mode constants defined above
   * filters: file type filters, it can be presented in any of the following forms:
   *   - an integer: OR value of some of the predefined filters constants
   *   - ["description", "ext"]: a specific type where "ext" is the file extension
   *     and "description" is a desciption of the type
   *   - [f1, f2..]: an array of items, each item has one of above two forms
   *
   * return value:
   * An array of paths. Will return [] if the user canceled the dialog. If a returned file exists
   * and it is chosen to overwritten, then the user has comfirmed the overwritten.
   */
module.exports.openModalFileDialog = function(mode, filters, title) {
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  // initialize
  if (title===undefined) title = null;
  fp.init(utils.activeBrowserWindow, title, mode);

  // setup filters
  if (typeof filters === "number" || (typeof filters[0] === "string" && filters.length === 2))
    filters = [filters];
  for (let i in filters) {
    let filter = filters[i];
    if (typeof filter === "number") {
      fp.appendFilters(filter);
    } else if (filter.length === 2 && typeof filter[0] === "string" && typeof filter[1]=== "string") {
      fp.appendFilter(filter[0], filter[1]);
    }
  }

  // show the file dialog modally
  let rv = fp.show();

  // put selected file path(s) in array
  let result = [];
  if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
    if (mode == nsIFilePicker.modeOpenMultiple) {
      var files = fp.files;
      while (files.hasMoreElements()) {
        var arg = files.getNext().QueryInterface(Ci.nsILocalFile).path;
        result.push(arg);
      }
    } else {
      result.push(fp.file.path);
    }
  }

  return result;
};
