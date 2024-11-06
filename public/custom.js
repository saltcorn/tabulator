/* eslint-env browser */
/* globals dayjs, view_post, $, _sc_globalCsrf, tabulator_error_handler, ajax_modal */
//custom max min header filter
var minMaxFilterEditor = function (
  cell,
  onRendered,
  success,
  cancel,
  editorParams
) {
  var end;

  var container = document.createElement("span");

  //create and style inputs
  var start = document.createElement("input");
  start.setAttribute("type", "number");
  start.setAttribute("placeholder", "Min");
  start.setAttribute("min", 0);
  start.setAttribute("max", 100);
  start.style.padding = "4px";
  start.style.width = "50%";
  start.style.boxSizing = "border-box";

  start.value = cell.getValue();

  function buildValues() {
    success({
      start: start.value,
      end: end.value,
    });
  }

  onRendered(function (...args) {
    var newVal = cell.getValue();
    start.value = newVal.start;
    end.value = newVal.end;
  });

  function keypress(e) {
    if (e.keyCode == 13) {
      buildValues();
    }

    if (e.keyCode == 27) {
      cancel();
    }
  }

  end = start.cloneNode();
  end.setAttribute("placeholder", "Max");

  start.addEventListener("change", buildValues);
  start.addEventListener("blur", buildValues);
  start.addEventListener("keydown", keypress);

  end.addEventListener("change", buildValues);
  end.addEventListener("blur", buildValues);
  end.addEventListener("keydown", keypress);

  container.appendChild(start);
  container.appendChild(end);

  return container;
};

//custom max min filter function
function minMaxFilterFunction(headerValue, rowValue, rowData, filterParams) {
  //headerValue - the value of the header filter element
  //rowValue - the value of the column in this row
  //rowData - the data for the row being filtered
  //filterParams - params object passed to the headerFilterFuncParams property
  //console.log("minmax filt", headerValue);
  if (rowValue) {
    if (headerValue.start != "") {
      if (headerValue.end != "") {
        return rowValue >= headerValue.start && rowValue <= headerValue.end;
      } else {
        return rowValue >= headerValue.start;
      }
    } else {
      if (headerValue.end != "") {
        return rowValue <= headerValue.end;
      }
    }
  }

  return headerValue?.start !== "" || headerValue?.end !== "" ? false : true; //must return a boolean, true if it passes the filter.
}

//custom max min header filter
var dateFilterEditor = function (
  cell,
  onRendered,
  success,
  cancel,
  editorParams
) {
  const input = $("<input type='text'/>");
  input.flatpickr({
    mode: "range",
    locale: "en", // global variable with locale 'en', 'fr', ...
    onClose: function (selectedDates, dateStr, instance) {
      var evt = window.event;
      var isEscape = false;
      if ("key" in evt) {
        isEscape = evt.key === "Escape" || evt.key === "Esc";
      } else {
        isEscape = evt.keyCode === 27;
      }
      if (isEscape) {
        // user hit escape
        input[0]._flatpickr.clear();
        success({});
      } else {
        success({
          start: new Date(selectedDates[0]),
          end: new Date(selectedDates[1]),
        });
      }
    },
  });
  input.css({
    border: "1px solid #ced4da",
    background: "transparent",
    padding: "4px",
    width: "100%",
    "box-sizing": "border-box",
  });

  return input[0];
};

function dateFilterFunction(headerValue, rowValue0, rowData, filterParams) {
  if (rowValue0) {
    const rowValue = new Date(rowValue0);
    if (headerValue.start) {
      if (headerValue.end) {
        return rowValue >= headerValue.start && rowValue <= headerValue.end;
      } else {
        return rowValue >= headerValue.start;
      }
    } else {
      if (headerValue.end) {
        return rowValue <= headerValue.end;
      } else {
        return true;
      }
    }
  }

  return headerValue?.start !== "" || headerValue?.end !== "" ? false : true; //must return a boolean, true if it passes the filter.
}

function optionalImageFormatter(cell, formatterParams, onRendered) {
  var el = document.createElement("img"),
    src = cell.getValue();

  if (!src) return "";
  if (formatterParams.urlPrefix) {
    src = formatterParams.urlPrefix + cell.getValue();
  }

  if (formatterParams.urlSuffix) {
    src = src + formatterParams.urlSuffix;
  }

  el.setAttribute("src", src);

  switch (typeof formatterParams.height) {
    case "number":
      el.style.height = formatterParams.height + "px";
      break;

    case "string":
      el.style.height = formatterParams.height;
      break;
  }

  switch (typeof formatterParams.width) {
    case "number":
      el.style.width = formatterParams.width + "px";
      break;

    case "string":
      el.style.width = formatterParams.width;
      break;
  }

  el.addEventListener("load", function () {
    cell.getRow().normalizeHeight();
  });

  return el;
}

function heatCellFormatter(cell, formatterParams) {
  const v = cell.getValue();
  const attrs = formatterParams;
  if (typeof v !== "number") return "";
  const pcnt0 = (v - attrs.min) / (attrs.max - attrs.min);
  const pcnt = attrs.reverse ? 1 - pcnt0 : pcnt0;
  const backgroundColor = {
    Rainbow: `hsl(${360 * pcnt},100%, 50%)`,
    RedAmberGreen: `hsl(${100 * pcnt},100%, 50%)`,
    WhiteToRed: `hsl(0,100%, ${100 * (1 - pcnt / 2)}%)`,
  }[attrs.color_scale];
  let el = document.createElement("div");
  el.innerText = v;
  el.style.width = "100%";
  el.style.height = `${attrs.em_height || 1}em`;
  el.style.backgroundColor = backgroundColor;
  el.className = "px-2";
  return el;
}

function add_preset(viewname) {
  let name = prompt("Name of new preset");
  if (!name) return;
  const preset = {};
  $(".tabShowHideCols")
    .find("input[data-fieldname]")
    .each(function () {
      preset[$(this).attr("data-fieldname")] = !!$(this).prop("checked");
    });
  view_post(viewname, "add_preset", {
    name,
    preset,
  });
}

function delete_preset(viewname, name) {
  view_post(viewname, "delete_preset", {
    name,
  });
}

function showHideColView(nm, e, rndid) {
  if (e && e.checked) window["tabulator_table_" + rndid].showColumn(nm);
  else window["tabulator_table_" + rndid].hideColumn(nm);
}

function activate_preset(encPreset, rndid) {
  const preset = JSON.parse(decodeURIComponent(encPreset));
  $(".tabShowHideCols")
    .find("input[data-fieldname]")
    .each(function () {
      const name = $(this).attr("data-fieldname");
      const do_show = preset[name];
      if (do_show !== false)
        window["tabulator_table_" + rndid].showColumn(name);
      else window["tabulator_table_" + rndid].hideColumn(name);
      $(this).prop("checked", do_show);
    });
}

function tabUserGroupBy(e, rndid, orderFld, orderDesc) {
  if (orderFld)
    window["tabulator_table_" + rndid].setSort([
      { column: orderFld, dir: orderDesc ? "desc" : "asc" },
    ]);
  window["tabulator_table_" + rndid].setSort([{ column: e.value, dir: "asc" }]);
  window["tabulator_table_" + rndid].setGroupBy(e.value);
  window["tabulator_table_" + rndid].setGroupBy(e.value);
}

let tab_selected_rows;

function run_selected_rows_action(viewname, selectable, rndid, hasChildren) {
  const rows0 = window["tabulator_table_" + rndid].getRows("active");
  let rows1 = [];
  if (!selectable) rows1 = rows0;
  else {
    const go = (rows) => {
      rows.forEach((r) => {
        if (r.isSelected()) rows1.push(r);

        const children = hasChildren && r.getTreeChildren();
        if (children && children.length && children.length > 0) go(children);
      });
    };
    go(rows0);
  }
  const rows = rows1.map((r) => r.getData());
  tab_selected_rows = rows;
  view_post(viewname, "run_selected_rows_action", {
    rows,
    rndid,
  });
}

function tabulator_colcalc_unique(values, data, calcParams) {
  //values - array of column values
  //data - all table data
  //calcParams - params passed from the column definition object
  var set = new Set(values);

  return set.size;
}

function tabulator_colcalc_counttrue(values, data, calcParams) {
  return values.filter((v) => v === true).length;
}

function tabulator_colcalc_sumroundquarter(values, data, calcParams) {
  return Math.round(values.reduce((sum, num) => sum + num, 0) * 4) / 4;
}

function tabulator_colcalc_countfalse(values, data, calcParams) {
  return values.filter((v) => v === false).length;
}

function tabulator_colcalc_avgnonulls(values, data, calcParams) {
  let sum = 0.0,
    count = 0,
    precision =
      typeof calcParams.precision !== "undefined" ? calcParams.precision : 2;
  values.forEach((v) => {
    if (typeof v === "number" && !isNaN(v)) {
      sum += v;
      count += 1;
    }
  });
  return (sum / count).toFixed(precision);
}

function add_tabview_row(rndid) {
  window["tabulator_table_" + rndid].addRow({}, true);
}

function pivotEditCheck(cell) {
  const row = cell.getRow().getData();
  return !(row.disableEdit || row._disable_edit);
}

function pivot_edit_popup(e, cell) {
  if (!window.pivot_tabulator_edit_view) return;
  const data = cell.getRow().getData();
  if (data.disableEdit || data._disable_edit) return;
  const field = cell.getField();
  const id = data.ids[field];

  if (id) {
    const url = `/view/${window.pivot_tabulator_edit_view}?${window.pivot_tabulator_table_pk}=${id}`;
    ajax_modal(url);
  } else {
    const url = `/view/${window.pivot_tabulator_edit_view}?${window.pivot_tabulator_row_field}=${data.rawRowValue}&${window.pivot_tabulator_col_field_name}=${field}
    `;
    console.log(url);
    ajax_modal(url);
  }
}

function tabulator_edit_check(row) {
  const data = row.getRow().getData();
  return !(data._disable_edit || data.disableEdit);
}

function pivotEditRecalc(cell, { column_calculation, calc_pos } = {}) {
  let column = cell.getColumn();
  let cells = column.getCells();
  const values = cells.map((c) => c.getValue());
  if (calc_pos === "Top") values.shift();
  else values.pop();
  let result;
  switch (column_calculation) {
    case "sum":
      result = values.reduce((partialSum, a) => partialSum + (a || 0), 0);
      break;
    case "max":
      result = Math.max(...values);
      break;
    case "min":
      result = Math.min(...values);
      break;
    case "avg":
      result =
        values.reduce((partialSum, a) => partialSum + (a || 0), 0) /
        values.filter((v) => typeof v !== "undefined" && v !== null).length;
      break;
    case "count":
      result = values.filter(
        (v) => typeof v !== "undefined" && v !== null
      ).length;
      break;
    default:
      break;
  }
  if (calc_pos === "Top") {
    cells[0].setValue(result);
  } else {
    cells[cells.length - 1].setValue(result);
  }
}

let lastRowEdited;
const storeRowEditing = (cell) => {
  lastRowEdited = { ...cell.getRow().getData() };
};

const gen_save_row_from_cell =
  ({ confirm_edits, rndid, hasCalculated, table_name, viewname }) =>
  (row, cell, noid) => {
    if (confirm_edits) {
      if (cell.isEdited() && !window.confirm("Are you sure?")) {
        cell.clearEdited();
        cell.setValue(cell.getOldValue());
        return;
      }
    }
    const isNode = typeof parent.saltcorn?.data === "undefined";
    const postFn = (saveRow, cb) => {
      const url = `/api/${table_name}/` + (noid ? "" : row.id || "");
      if (isNode)
        $.ajax({
          type: "POST",
          url: url,
          data: saveRow,
          headers: {
            "CSRF-Token": _sc_globalCsrf,
          },
          error: tabulator_error_handler,
        }).done(cb);
      else
        parent.router
          .resolve({
            pathname: `post${url}`,
            query: new URLSearchParams(saveRow).toString(),
          })
          .then(cb);
    };
    const fld = typeof cell === "string" ? cell : cell.getField();
    const colDef = cell.getColumn().getDefinition();
    let rerender = false;
    //for JSON list edits (json with options in schema)
    if (colDef && colDef.jsonEditSubfield && lastRowEdited) {
      let oldVal = lastRowEdited[fld];
      if (typeof oldVal == "object" && oldVal[colDef.jsonEditSubfield] !== null)
        oldVal[colDef.jsonEditSubfield] = row[fld];
      else {
        oldVal = { [colDef.jsonEditSubfield]: row[fld] };
      }
      row[fld] = oldVal;
      rerender = true;
    }

    if (typeof row[fld] === "undefined") return;
    const saveRow = { [fld]: row[fld] };
    postFn(saveRow, function (resp) {
      if (rerender) cell.getRow().reformat();
      if (resp.success && typeof resp.success === "number" && !row.id && cell) {
        window[`tabulator_table_${rndid}`].updateRow(cell.getRow(), {
          id: resp.success,
        });
      }
      if (hasCalculated && typeof cell !== "string") {
        let id = noid ? resp.success : row.id;
        view_post(viewname, "get_rows", { state: { id } }, (resp) => {
          const uprow = Array.isArray(resp.success)
            ? resp.success[0]
            : Array.isArray(resp)
            ? resp[0]
            : null;
          if (uprow) {
            //save the children!!
            const children = cell
              .getRow()
              .getTreeChildren()
              .map((cr) => cr.getData());
            window[`tabulator_table_${rndid}`].updateRow(cell.getRow(), uprow);
            if (!uprow._children?.length && children.length)
              children.forEach((cr) => cell.getRow().addTreeChild(cr));
          }
        });
      }
    });
  };

const sc_tab_downloadEncoder = function (fileContents, mimeType) {
  //fileContents - the unencoded contents of the file
  //mimeType - the suggested mime type for the output

  //custom action to send blob to server could be included here
  return new Blob([fileContents.replaceAll(/<[^>]*>/g, "")], {
    type: mimeType,
  }); //must return a blob to proceed with the download, return false to abort download
};

function ellipsizeFormatter(cell, formatterParams, onRendered) {
  const s = cell.getValue();
  const nchars = formatterParams?.nchars || 20;
  if (!s || !s.length) return "";
  if (s.length <= nchars) return s;
  return s.substr(0, nchars - 3) + "...";
}

function jsonSubFormatter(cell, formatterParams, onRendered) {
  const val = cell.getValue();
  if (!val) return "";
  const subval = val[(formatterParams || {}).subfield];
  return subval;
}

function toLocaleStringFormatter(cell, formatterParams, onRendered) {
  const val = cell.getValue();
  if (typeof val === "undefined" || val === null) return "";
  const subval = val[(formatterParams || {}).subfield];
  const attrs = formatterParams || {};
  return val.toLocaleString(formatterParams.locale || window._sc_locale, {
    style: attrs.style,
    currency: attrs.currency,
    currencyDisplay: attrs.currencyDisplay,
    unit: attrs.unit,
    unitDisplay: attrs.unitDisplay,
    maximumSignificantDigits:
      attrs.maximumSignificantDigits === 0
        ? 0
        : attrs.maximumSignificantDigits || undefined,
    maximumFractionDigits:
      attrs.maximumFractionDigits == 0
        ? 0
        : attrs.maximumFractionDigits || undefined,
  });
}

function jsonSubAccessor(value, data, type, params, column, row) {
  //if (!value || typeof value !== "object") return "";
  const rdata = row.getData();
  const subval = rdata?.[(params || {}).field]?.[(params || {}).subfield];
  return subval;
}

function jsonSubEditor(cell, onRendered, success, cancel, editorParams) {
  const val = cell.getValue() || {};
  const subval = val[editorParams.subfield] || "";
  var editor = document.createElement("input");

  editor.value = subval;
  function successFunc(e) {
    const newVal = { ...val };
    newVal[editorParams.subfield] = editor.value;
    success(newVal);
  }

  editor.addEventListener("change", successFunc);
  editor.addEventListener("blur", successFunc);

  return editor;
}

function customPasteParser(clipboard) {
  console.log("pasting", clipboard);

  var data = [],
    rows = [],
    range = this.table.modules.selectRange.activeRange,
    singleCell = false,
    bounds,
    startCell,
    colWidth,
    columnMap,
    startCol;

  if (range) {
    bounds = range.getBounds();
    startCell = bounds.start;

    if (bounds.start === bounds.end) {
      singleCell = true;
    }

    if (startCell) {
      //get data from clipboard into array of columns and rows.
      clipboard = clipboard.split("\n");

      clipboard.forEach(function (row) {
        data.push(row.split("\t"));
      });

      if (data.length) {
        columnMap = this.table.columnManager.getVisibleColumnsByIndex();
        startCol = columnMap.indexOf(startCell.column);

        if (startCol > -1) {
          if (singleCell) {
            colWidth = data[0].length;
          } else {
            colWidth = columnMap.indexOf(bounds.end.column) - startCol + 1;
          }

          columnMap = columnMap.slice(startCol, startCol + colWidth);
          const commaDecimal =
            Intl.NumberFormat(window._sc_locale).format(1.5) === "1,5";
          data.forEach((item) => {
            var row = {};
            var itemLength = item.length;

            columnMap.forEach(function (col, i) {
              const val = item[i % itemLength];
              if (
                col.definition.editor === "number" &&
                typeof val === "string" &&
                commaDecimal
              ) {
                row[col.field] = val.replaceAll(".", "").replaceAll(",", ".");
              } else row[col.field] = val;
            });

            rows.push(row);
          });

          return rows;
        }
      }
    }
  }

  return false;
}

function tabCustomCsvDownload(list, options = {}, setFileContents) {
  var delimiter = options.delimiter ? options.delimiter : ",",
    fileContents = [],
    headers = [];

  list.forEach((row) => {
    var item = [];

    switch (row.type) {
      case "group":
        console.warn(
          "Download Warning - CSV downloader cannot process row groups"
        );
        break;

      case "calc":
        console.warn(
          "Download Warning - CSV downloader cannot process column calculations"
        );
        break;

      case "header":
        row.columns.forEach((col, i) => {
          if (col && col.depth === 1) {
            headers[i] =
              typeof col.value == "undefined" || col.value === null
                ? ""
                : '"' + String(col.value).split('"').join('""') + '"';
          }
        });
        break;

      case "row":
        row.columns.forEach((col) => {
          if (col) {
            const formatterParams =
              col.component.getDefinition()?.formatterParams;
            if (formatterParams?.subfield) {
              const jvalue = col.value?.[formatterParams?.subfield];
              item.push(
                '"' +
                  String(typeof jvalue === "undefined" ? "" : jvalue)
                    .split('"')
                    .join('""') +
                  '"'
              );
            } else {
              switch (typeof col.value) {
                case "object":
                  col.value =
                    col.value !== null ? JSON.stringify(col.value) : "";
                  break;

                case "undefined":
                  col.value = "";
                  break;
              }

              item.push('"' + String(col.value).split('"').join('""') + '"');
            }
          }
        });

        fileContents.push(item.join(delimiter));
        break;
    }
  });

  if (headers.length) {
    fileContents.unshift(headers.join(delimiter));
  }

  fileContents = fileContents.join("\n");

  if (options.bom) {
    fileContents = "\ufeff" + fileContents;
  }

  setFileContents(fileContents, "text/csv");
}

function run_action_multi_edit(edit_name, rndid, viewname) {
  ajax_modal(`/view/${edit_name}`, {
    onOpen() {
      $('#scmodal button[onclick="ajaxSubmitForm(this)"]').attr(
        "onclick",
        `final_action_multi_edit("${edit_name}", "${rndid}", "${viewname}")`
      );
    },
  });
}
function final_action_multi_edit(edit_name, rndid, viewname) {
  //get form data
  const action_edit_row = get_form_record({ viewname: edit_name });
  view_post(
    viewname,
    "run_selected_rows_action",
    {
      rows: tab_selected_rows,
      action_edit_row,
      rndid,
    },
    () => {
      reload_embedded_view(viewname);
      close_saltcorn_modal();
    }
  );
}

function relativeDateFormatter(cell, formatterParams, onRendered) {
  const val = cell.getValue();
  if (!val) return "";
  return dayjs(val).fromNow();
}

// dayjs relative time
!(function (r, e) {
  "object" == typeof exports && "undefined" != typeof module
    ? (module.exports = e())
    : "function" == typeof define && define.amd
    ? define(e)
    : ((r =
        "undefined" != typeof globalThis
          ? globalThis
          : r || self).dayjs_plugin_relativeTime = e());
})(this, function () {
  "use strict";
  return function (r, e, t) {
    r = r || {};
    var n = e.prototype,
      o = {
        future: "in %s",
        past: "%s ago",
        s: "a few seconds",
        m: "a minute",
        mm: "%d minutes",
        h: "an hour",
        hh: "%d hours",
        d: "a day",
        dd: "%d days",
        M: "a month",
        MM: "%d months",
        y: "a year",
        yy: "%d years",
      };
    function i(r, e, t, o) {
      return n.fromToBase(r, e, t, o);
    }
    (t.en.relativeTime = o),
      (n.fromToBase = function (e, n, i, d, u) {
        for (
          var f,
            a,
            s,
            l = i.$locale().relativeTime || o,
            h = r.thresholds || [
              { l: "s", r: 44, d: "second" },
              { l: "m", r: 89 },
              { l: "mm", r: 44, d: "minute" },
              { l: "h", r: 89 },
              { l: "hh", r: 21, d: "hour" },
              { l: "d", r: 35 },
              { l: "dd", r: 25, d: "day" },
              { l: "M", r: 45 },
              { l: "MM", r: 10, d: "month" },
              { l: "y", r: 17 },
              { l: "yy", d: "year" },
            ],
            m = h.length,
            c = 0;
          c < m;
          c += 1
        ) {
          var y = h[c];
          y.d && (f = d ? t(e).diff(i, y.d, !0) : i.diff(e, y.d, !0));
          var p = (r.rounding || Math.round)(Math.abs(f));
          if (((s = f > 0), p <= y.r || !y.r)) {
            p <= 1 && c > 0 && (y = h[c - 1]);
            var v = l[y.l];
            u && (p = u("" + p)),
              (a = "string" == typeof v ? v.replace("%d", p) : v(p, n, y.l, s));
            break;
          }
        }
        if (n) return a;
        var M = s ? l.future : l.past;
        return "function" == typeof M ? M(a) : M.replace("%s", a);
      }),
      (n.to = function (r, e) {
        return i(r, e, this, !0);
      }),
      (n.from = function (r, e) {
        return i(r, e, this);
      });
    var d = function (r) {
      return r.$u ? t.utc() : t();
    };
    (n.toNow = function (r) {
      return this.to(d(this), r);
    }),
      (n.fromNow = function (r) {
        return this.from(d(this), r);
      });
  };
});
dayjs.extend(window.dayjs_plugin_relativeTime);
