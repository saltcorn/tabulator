const crypto = require("crypto");
const db = require("@saltcorn/data/db");
const { getState, features } = require("@saltcorn/data/db/state");
const { eval_expression } = require("@saltcorn/data/models/expression");
const { post_btn, localeDate, localeDateTime } = require("@saltcorn/markup");
const {
  text,
  div,
  h5,
  style,
  a,
  script,
  pre,
  domReady,
  button,
  i,
  form,
  input,
  label,
  text_attr,
  select,
  option,
  link,
} = require("@saltcorn/markup/tags");

const {
  action_url,
  view_linker,
  parse_view_select,
  action_link,
  make_link,
  splitUniques,
} = require("@saltcorn/data/base-plugin/viewtemplates/viewable_fields");

const isNode = typeof window === "undefined";

//copy from server/routes/list.js
const typeToGridType = (t, field, header_filters, column, calculators) => {
  const jsgField = { field: field.name, title: field.label, editor: true };
  if (t.name === "String" && field.attributes && field.attributes.options) {
    jsgField.editor = "list";

    const values = field.attributes.options.split(",").map((o) => o.trim());
    if (!field.required) values.unshift("");

    jsgField.editorParams = { values, autocomplete: true, listOnEmpty: true };
    if (header_filters) jsgField.headerFilterParams = { values };
    jsgField.headerFilter = !!header_filters;
  } else if (t.name === "String") {
    jsgField.headerFilter = !!header_filters;
    jsgField.sorter = "string";
    if (column.fieldview === "textarea") {
      jsgField.formatter = "textarea";
      jsgField.editor = false;
      if (jsgField.headerFilter) jsgField.headerFilter = "input";
    }
  } else if (t === "Key" || t === "File") {
    if (field.fieldview === "Thumbnail") {
      jsgField.formatter = "__optionalImageFormatter";
      jsgField.formatterParams = {
        height: field.attributes?.height
          ? `${field.attributes?.height || 50}px`
          : undefined,
        width: `${field.attributes?.width || 50}px`,
        urlPrefix: "/files/resize/",
        urlSuffix:
          `/${field.attributes?.width || 50}` +
          (field.attributes?.height ? `/${field.attributes.height}` : ""),
      };
      jsgField.editor = false;
    } else {
      jsgField.editor = "list";
      const values = {};
      (field.options || []).forEach(
        ({ label, value }) => (values[value] = label)
      );
      calculators.push((row) => {
        if (row[field.name]) row[field.name] = `${row[field.name]}`;
      });
      jsgField.editorParams = { values, autocomplete: true, listOnEmpty: true };
      jsgField.formatterParams = { values };
      if (header_filters) jsgField.headerFilterParams = { values };
      jsgField.formatter = "__lookupIntToString";
      jsgField.headerFilter = !!header_filters;
      jsgField.headerFilterFunc = "=";
    }
  } else if (t.name === "Float" || t.name === "Integer") {
    jsgField.editor = "number";
    jsgField.sorter = "number";
    jsgField.hozAlign = "right";
    jsgField.headerHozAlign = "right";
    jsgField.editorParams = {
      step: t.name === "Integer" ? 1 : undefined,
      min:
        typeof field.attributes.min !== "undefined"
          ? field.attributes.min
          : undefined,
      max:
        typeof field.attributes.max !== "undefined"
          ? field.attributes.max
          : undefined,
    };
    jsgField.headerFilter = !!header_filters && "__minMaxFilterEditor";
    jsgField.headerFilterFunc = "__minMaxFilterFunction";
    jsgField.headerFilterLiveFilter = false;
    if (field.fieldview === "show_star_rating") {
      jsgField.formatter = "star";
      jsgField.formatterParams = {
        stars: (field.attributes?.max || 5) - (field.attributes?.min || 1) + 1,
      };
      jsgField.editor = "star";
    }
    if (field.fieldview === "progress_bar") {
      jsgField.formatter = "progress";
      jsgField.formatterParams = {};
      if (column.max && !isNaN(+column.max))
        jsgField.formatterParams.max = +column.max;
      if (column.min && !isNaN(+column.min))
        jsgField.formatterParams.min = +column.min;
      if (column.bar_color) jsgField.formatterParams.color = column.bar_color;

      jsgField.hozAlign = "left";
      jsgField.headerHozAlign = "left";
    }
  } else if (t.name === "Bool") {
    jsgField.editor = "tickCross";
    jsgField.formatter = "tickCross";
    jsgField.hozAlign = "center";
    jsgField.vertAlign = "center";
    jsgField.editorParams = field.required ? {} : { tristate: true };
    jsgField.formatterParams = field.required ? {} : { allowEmpty: true };
    jsgField.headerFilter = !!header_filters;
  } else if (t.name === "Date") {
    jsgField.sorter = "date";

    jsgField.sorter = "date";
    jsgField.sorterParams = {
      format: "iso",
    };
    jsgField.editor = "__flatpickerEditor";

    if (field.fieldview === "showDay") {
      jsgField.editorParams = { dayOnly: true };
      jsgField.formatter = "__isoDateFormatter";
    } else if (field.fieldview === "format") {
      jsgField.formatter = "__isoDateFormatter";
      jsgField.formatterParams = {
        format: field.attributes.format,
      };
    } else {
      jsgField.formatter = "datetime";
      jsgField.formatterParams = {
        inputFormat: "iso",
      };
    }
    jsgField.headerFilter = !!header_filters && "__dateFilterEditor";
    jsgField.headerFilterFunc = "__dateFilterFunction";
    jsgField.headerFilterLiveFilter = false;
  } else if (t.name === "Color") {
    jsgField.editor = "__colorEditor";
    jsgField.formatter = "__colorFormatter";
    jsgField.hozAlign = "center";
    jsgField.vertAlign = "center";
  } else if (t.name === "JSON") {
    if (field.fieldview === "keys_expand_columns") {
      const fv = t.fieldviews.keys_expand_columns;
      const ex = fv.expandColumns(field, column, column);
      jsgField.subcolumns = ex;
      jsgField.field = field;
    } else {
      jsgField.formatter = "__jsonFormatter";
      jsgField.editor = "__jsonEditor";
    }
  } else if (t.name === "SharedFileLink") {
    //console.log(t, column);
    jsgField.formatter = "html";
    const rndid = "col" + hashCol(column);
    const fv = t.fieldviews[column.fieldview];

    calculators.push((row) => {
      row[rndid] =
        fv && row[column.field_name]
          ? fv.run(row[column.field_name], undefined, field.attributes)
          : "";
    });
    jsgField.field = rndid;
    jsgField.clipboard = false;
    jsgField.headerFilter = !!header_filters && "input";
    jsgField.editor = false;
  }

  if (field.calculated) {
    jsgField.editor = false;
  }
  if (field.primary_key) {
    jsgField.editor = false;
  }
  return jsgField;
};

const hashCol = (col) =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify(col))
    .digest("hex")
    .substring(0, 8);

const set_json_col = (tcol, field, key, header_filters) => {
  if (field?.attributes?.hasSchema && field.attributes.schema) {
    const schemaType = field.attributes.schema.find((t) => t.key === key);
    //console.log(schemaType);
    switch (schemaType?.type) {
      case "Integer":
      case "Float":
        tcol.sorter = "number";
        tcol.hozAlign = "right";
        tcol.headerHozAlign = "right";
        tcol.headerFilter = header_filters && "__minMaxFilterEditor";
        tcol.headerFilterFunc = "__minMaxFilterFunction";
        tcol.headerFilterLiveFilter = false;
        break;
      case "String":
        tcol.headerFilter = header_filters && "input";
        break;
      case "Bool":
        tcol.formatter = "tickCross";
        tcol.hozAlign = "center";
        tcol.vertAlign = "center";
        break;
      default:
        break;
    }
    if (schemaType?.type.startsWith("Key to")) {
      tcol.headerFilter = header_filters && "input";

      tcol.lookupFkeys = {
        table: schemaType.type.replace("Key to ", ""),
        field: schemaType.summary_field,
      };
    }
  }
};

const get_tabulator_columns = async (
  viewname,
  table,
  fields,
  columns,
  isShow,
  req,
  header_filters,
  vert_col_headers,
  dropdown_frozen
) => {
  const tabcols = [];
  const calculators = [];
  const dropdown_actions = [];
  for (const column of columns) {
    let tcol = {};
    if (column.type === "Field") {
      let f = fields.find((fld) => fld.name === column.field_name);
      if (!f) return {};
      Object.assign(f.attributes, column);
      f.fieldview = column.fieldview;
      if (column.fieldview === "subfield") {
        tcol.editor = false;
        const key = `${column.field_name}_${column.key}`;
        calculators.push((row) => {
          row[key] = (row[column.field_name] || {})[column.key];
        });
        tcol.field = key;
        tcol.title = column.key;
        tcol.headerFilter = !!header_filters;
        set_json_col(tcol, f, column.key, header_filters);
      } else
        tcol = typeToGridType(f.type, f, header_filters, column, calculators);
    } else if (column.type === "JoinField") {
      let refNm, targetNm, through, key, type;
      if (column.join_field.includes("->")) {
        const [relation, target] = column.join_field.split("->");
        const [ontable, ref] = relation.split(".");
        targetNm = target;
        refNm = ref;
        key = `${ref}_${ontable}_${target}`;
      } else {
        const keypath = column.join_field.split(".");
        refNm = keypath[0];
        targetNm = keypath[keypath.length - 1];
        key = keypath.join("_");
      }
      if (column.fieldview === "subfield") {
        const f = await table.getField(column.join_field);
        tcol.editor = false;
        const jkey = `${key}_${column.key}`;
        calculators.push((row) => {
          row[jkey] = (row[key] || {})[column.key];
        });
        tcol.field = jkey;
        tcol.title = column.key;
        tcol.headerFilter = !!header_filters;
        set_json_col(tcol, f, column.key, header_filters);
      } else {
        if (column.field_type && column.field_obj) {
          tcol = typeToGridType(
            getState().types[column.field_type],
            column.field_obj,
            header_filters,
            column,
            calculators
          );
        }
        tcol.field = key;
      }
      tcol.editor = false;
    } else if (column.type === "Aggregation") {
      let table, fld, through;
      const rndid = "col" + hashCol(column);
      if (column.agg_relation.includes("->")) {
        let restpath;
        [through, restpath] = column.agg_relation.split("->");
        [table, fld] = restpath.split(".");
      } else {
        [table, fld] = column.agg_relation.split(".");
      }
      const targetNm =
        column.targetNm ||
        db.sqlsanitize(
          (
            column.stat.replace(" ", "") +
            "_" +
            table +
            "_" +
            fld +
            db.sqlsanitize(column.aggwhere || "")
          ).toLowerCase()
        );
      tcol.formatter = "html";
      let showValue = (value) => {
        if (value === true)
          return i({
            class: "fas fa-lg fa-check-circle text-success",
          });
        else if (value === false)
          return i({
            class: "fas fa-lg fa-times-circle text-danger",
          });
        if (value instanceof Date) return localeDateTime(value);
        if (Array.isArray(value))
          return value.map((v) => showValue(v)).join(", ");
        return value?.toString ? value.toString() : value;
      };
      if (column.agg_fieldview && column.agg_field?.includes("@")) {
        const tname = column.agg_field.split("@")[1];
        const type = getState().types[tname];
        if (type?.fieldviews[column.agg_fieldview])
          showValue = (x) =>
            type.fieldviews[column.agg_fieldview].run(x, req, column);
      }
      calculators.push((row) => {
        let value = row[targetNm];

        row[rndid] = showValue(value);
      });
      tcol.field = rndid; //db.sqlsanitize(targetNm);
      tcol.headerFilter = !!header_filters;
    } else if (column.type === "FormulaValue") {
      const rndid = "col" + hashCol(column);
      calculators.push((row) => {
        row[rndid] = eval_expression(column.formula, row);
      });
      tcol.field = rndid;
      tcol.headerFilter = !!header_filters && "input";
    } else if (column.type === "ViewLink") {
      tcol.formatter = "html";
      const rndid = "col" + hashCol(column);
      const { key } = view_linker(
        column,
        fields,
        req?.__ ? req.__ : (s) => s,
        isNode
      );
      calculators.push((row) => {
        row[rndid] = key(row);
      });
      tcol.field = rndid;
      tcol.clipboard = false;
      tcol.headerFilter = !!header_filters && "input";
      if (column.in_dropdown) {
        dropdown_actions.push({
          column,
          rndid,
          wholeLink: true,
          label: column.label || column.action_name,
        });
        tcol = false;
      }
    } else if (column.type === "Link") {
      tcol.formatter = "html";
      const rndid = "col" + hashCol(column);

      const { key } = make_link(column, fields);
      calculators.push((row) => {
        row[rndid] = key(row);
      });
      tcol.field = rndid;
      tcol.clipboard = false;
      tcol.headerFilter = !!header_filters && "input";
      if (column.in_dropdown) {
        dropdown_actions.push({
          column,
          rndid,
          wholeLink: true,
          label: column.label || column.action_name,
        });
        tcol = false;
      }
    } else if (
      column.type === "Action" &&
      column.action_name === "Delete" &&
      !column.in_dropdown
    ) {
      tcol = {
        formatter: "buttonCross",
        title: i({ class: "far fa-trash-alt" }),
        width: 40,
        formatterParams: { confirm: column.confirm, tableName: table.name },
        hozAlign: "center",
        headerSort: false,
        clipboard: false,
        cellClick: "__delete_tabulator_row",
      };
    } else if (column.type === "Action") {
      tcol.formatter = "html";
      //console.log(column);
      const rndid = "col" + hashCol(column);
      calculators.push((row) => {
        const url = action_url(
          viewname,
          table,
          column.action_name,
          row,
          column.action_name,
          "action_name"
        );
        const action_label = column.action_label_formula
          ? eval_expression(column.action_label, row)
          : column.action_label || column.action_name;
        row[rndid] = column.in_dropdown
          ? url
          : action_link(url, req, { ...column, action_label });
      });
      tcol.field = rndid;
      tcol.clipboard = false;
      if (column.in_dropdown) {
        dropdown_actions.push({
          column,
          rndid,
          label: column.label || column.action_name,
        });
        tcol = false;
      }
    }
    if (!tcol) continue;
    if (tcol.subcolumns) {
      for (const { label, row_key } of tcol.subcolumns) {
        const [fld, subfld] = row_key;
        const scol = {};
        scol.editor = false;
        const key = `${fld}_${subfld}`;
        calculators.push((row) => {
          row[key] = (row[fld] || {})[subfld];
        });
        scol.field = key;
        scol.title = subfld;
        set_json_col(scol, tcol.field, subfld, header_filters);
        tabcols.push(scol);
      }
      continue;
    }
    if (column.header_label) tcol.title = column.header_label;
    if (column.frozen) tcol.frozen = true;
    if (column.disable_edit) tcol.editor = false;
    if (vert_col_headers) tcol.headerVertical = true;
    if (column.column_calculation) {
      tcol.bottomCalc = column.column_calculation;
      if (column.calc_dps)
        tcol.bottomCalcParams = { precision: column.calc_dps };
    }
    if (column.col_width) tcol.width = column.col_width;
    tabcols.push(tcol);
  }
  let arndid;

  if (dropdown_actions.length > 0) {
    arndid = "col_action_dd";
    calculators.push((row) => {
      let html = "";
      row[arndid] = button(
        {
          class: "btn btn-sm btn-xs btn-outline-secondary dropdown-toggle",
          disabled: true,
        },
        "Action"
      );
      dropdown_actions.forEach(({ label, column, rndid, wholeLink }) => {
        const action = row[rndid];
        if (action.javascript)
          html += a({ href: `javascript:${action.javascript}` }, label);
        else if (wholeLink) html += action;
        else
          html += post_btn(action, label, req.csrfToken(), {
            small: true,
            ajax: true,
            reload_on_done: true,
            btnClass: "dropdown-item",
            confirm: column.confirm,
            req,
          });
      });
      row._dropdown = html;
    });
    //const values = {};
    //dropdown_actions.forEach(({ label, rndid }) => {
    //  values[rndid] = label;
    //});

    tabcols.push({
      field: arndid,
      title: "Actions",
      clipboard: false,
      //editorParams: { values },
      formatter: "html",
      headerSort: false,
      clickPopup: "__actionPopup",
      frozen: !!dropdown_frozen,
    });
  }
  return {
    tabcolumns: tabcols,
    calculators,
    dropdown_id: arndid,
    dropdown_actions,
  };
};

//https://stackoverflow.com/a/55241491
const nest = (items, id = null) => {
  return items
    .filter((item) => item._parent === id)
    .map((item) => ({
      ...item,
      _children: !item.id ? [] : nest(items, item.id),
    }));
};

module.exports = { typeToGridType, hashCol, nest, get_tabulator_columns };
