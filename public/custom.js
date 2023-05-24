/* eslint-env browser */
/* globals view_post, $ */
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
  view_post(viewname, "run_selected_rows_action", {
    rows,
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
  return !row.disableEdit;
}

function pivot_edit_popup(e, cell) {
  if (!window.pivot_tabulator_edit_view) return;
  const data = cell.getRow().getData();
  if (data.disableEdit) return;
  const field = cell.getField();
  const id = data.ids[field];

  if (id) {
    const url = `/view/${window.pivot_tabulator_edit_view}?${window.pivot_tabulator_table_pk}=${id}`;
    console.log(url);
    ajax_modal(url);
  } else {
    console.log(data, { field, id });
    const url = `/view/${window.pivot_tabulator_edit_view}?${window.pivot_tabulator_row_field}=${data.rawRowValue}&${window.pivot_tabulator_col_field_name}=${field}
    `;
    console.log(url);
    ajax_modal(url);
  }
}

function tabulator_edit_check(row) {
  return !row.getRow().getData()._disable_edit;
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
