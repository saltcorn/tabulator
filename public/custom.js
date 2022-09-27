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

function optionalImageFormatter(cell, formatterParams, onRendered) {
  var el = document.createElement("img"),
    src = cell.getValue();

  if (!src) return ""
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
};

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

function activate_preset(encPreset, rndid) {
  const preset = JSON.parse(decodeURIComponent(encPreset));
  $(".tabShowHideCols")
    .find("input[data-fieldname]")
    .each(function () {
      const name = $(this).attr("data-fieldname");
      const do_show = preset[name];
      if (do_show !== false) window['tabulator_table_' + rndid].showColumn(name);
      else window['tabulator_table_' + rndid].hideColumn(name);
      $(this).prop("checked", do_show);
    });
}

function tabUserGroupBy(e, rndid, orderFld, orderDesc) {
  if (orderFld)
    window['tabulator_table_' + rndid].setSort([{ column: orderFld, dir: orderDesc ? 'desc' : "asc" }])
  window['tabulator_table_' + rndid].setSort([{ column: e.value, dir: "asc" }])
  window['tabulator_table_' + rndid].setGroupBy(e.value);
  window['tabulator_table_' + rndid].setGroupBy(e.value);
}

function run_selected_rows_action(viewname, selectable, rndid, hasChildren) {
  const rows0 = window['tabulator_table_' + rndid].getRows("active");
  let rows1 = [];
  if (!selectable)
    rows1 = rows0
  else {
    const go = rows => {
      rows.forEach(r => {
        if (r.isSelected()) rows1.push(r);

        const children = hasChildren && r.getTreeChildren();
        if (children && children.length && children.length > 0)
          go(children);
      })

    }
    go(rows0)
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

function add_tabview_row(rndid) {
  window['tabulator_table_' + rndid].addRow({}, true);
}