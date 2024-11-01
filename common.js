const crypto = require("crypto");
const db = require("@saltcorn/data/db");
const { getState, features } = require("@saltcorn/data/db/state");
const { eval_expression } = require("@saltcorn/data/models/expression");
const { interpolate } = require("@saltcorn/data/utils");
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
const User = require("@saltcorn/data/models/user");
const Table = require("@saltcorn/data/models/table");

const {
  action_url,
  view_linker,
  parse_view_select,
  action_link,
  make_link,
  splitUniques,
} = require("@saltcorn/data/base-plugin/viewtemplates/viewable_fields");
const { picked_fields_to_query } = require("@saltcorn/data/plugin-helper");
const isNode = typeof window === "undefined";

//copy from server/routes/list.js
const typeToGridType = (t, field, header_filters, column, calculators) => {
  const jsgField = { field: field.name, title: field.label, editor: true };
  if (column.fieldview === "show_with_html") {
    jsgField.formatter = "html";
    const rndid = "col" + hashCol(column);

    calculators.push((row) => {
      row[rndid] = row[column.field_name]
        ? interpolate(column.configuration?.code || column.code, {
            it: row[column.field_name],
          })
        : "";
    });
    jsgField.field = rndid;
    jsgField.headerFilter = !!header_filters && "input";
    jsgField.editor = false;
  } else if (
    t.name === "String" &&
    field.attributes &&
    field.attributes.options
  ) {
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
      jsgField.editor = "textarea";
      if (jsgField.headerFilter) jsgField.headerFilter = "input";
    } else if (column.fieldview === "ellipsize") {
      jsgField.formatter = "__ellipsizeFormatter";
      jsgField.formatterParams = {
        nchars: column.nchars || 20,
      };
      jsgField.editor = "input";
    }
  } else if (t === "Key" || t === "File") {
    if (column.fieldview === "Thumbnail") {
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
    if (column.fieldview === "to_locale_string") {
      jsgField.formatter = "__toLocaleStringFormatter";
      jsgField.formatterParams = column;
    }
    if (column.fieldview === "show_star_rating") {
      jsgField.formatter = "star";
      jsgField.formatterParams = {
        stars: (field.attributes?.max || 5) - (field.attributes?.min || 1) + 1,
      };
      jsgField.editor = "star";
    }
    if (column.fieldview === "progress_bar") {
      jsgField.formatter = "progress";
      jsgField.formatterParams = {};
      if (column.max && !isNaN(+column.max))
        jsgField.formatterParams.max = +column.max;
      else if (typeof field.attributes.max !== "undefined")
        jsgField.formatterParams.max = +field.attributes.max;
      if (column.min && !isNaN(+column.min))
        jsgField.formatterParams.min = +column.min;
      else if (typeof field.attributes.min !== "undefined")
        jsgField.formatterParams.min = +field.attributes.min;

      if (column.bar_color) jsgField.formatterParams.color = column.bar_color;

      jsgField.hozAlign = "left";
      jsgField.headerHozAlign = "left";
    }
    if (column.fieldview === "heat_cell") {
      jsgField.formatter = "__heatCellFormatter";
      jsgField.formatterParams = { ...column };
      if (typeof field.attributes.max !== "undefined")
        jsgField.formatterParams.max = +field.attributes.max;
      if (typeof field.attributes.min !== "undefined")
        jsgField.formatterParams.min = +field.attributes.min;
    }
  } else if (t.name === "Bool") {
    jsgField.editor = "tickCross";
    jsgField.formatter = "tickCross";
    jsgField.hozAlign = "center";
    jsgField.vertAlign = "center";
    jsgField.editorParams = field.required
      ? {}
      : { tristate: true, indeterminateValue: "" };
    jsgField.formatterParams = field.required ? {} : { allowEmpty: true };
    jsgField.headerFilter = !!header_filters;
    calculators.push((row) => {
      if (row[column.field_name] === null) row[column.field_name] = "";
    });
  } else if (t.name === "Date") {
    jsgField.sorter = "date";

    jsgField.sorter = "date";
    jsgField.sorterParams = {
      format: "iso",
    };
    jsgField.editor = "__flatpickerEditor";
    if (column.fieldview === "showDay" || field.fieldview === "showDay") {
      jsgField.editorParams = { dayOnly: true };
      jsgField.formatter = "__isoDateFormatter";
    } else if (column.fieldview === "format" || field.fieldview === "format") {
      jsgField.formatter = "__isoDateFormatter";
      jsgField.formatterParams = {
        format: column.format || field.attributes.format,
      };
    } else if (
      column.fieldview === "relative" ||
      field.fieldview === "relative"
    ) {
      jsgField.formatter = "__relativeDateFormatter";
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
    if (column.fieldview === "keys_expand_columns") {
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

const set_join_fieldviews = async ({ columns, fields }) => {
  for (const segment of columns) {
    const { join_field, join_fieldview, type } = segment;
    if (!join_fieldview || type !== "JoinField") continue;
    const keypath = join_field.split(".");

    let field,
      theFields = fields;
    for (let i = 0; i < keypath.length; i++) {
      const refNm = keypath[i];
      field = theFields.find((f) => f.name === refNm);
      if (!field || !field.reftable_name) break;
      const table = await Table.findOne({ name: field.reftable_name });
      if (!table) break;
      theFields = await table.getFields();
    }
    if (!field) continue;
    segment.field_obj = field;
    if (field && field.type === "File") segment.field_type = "File";
    else if (
      field?.type.name &&
      field.type.fieldviews &&
      field.type.fieldviews[join_fieldview]
    ) {
      segment.field_type = field.type.name;
      segment.fieldview = join_fieldview;
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
  dropdown_frozen,
  layout
) => {
  if (layout?.list_columns && layout.besides) {
    const typeMap = {
      field: "Field",
      join_field: "JoinField",
      view_link: "ViewLink",
      view: "View",
      link: "Link",
      action: "Action",
      blank: "Text",
      aggregation: "Aggregation",
      dropdown_menu: "DropdownMenu",
    };
    const toArray = (x) =>
      !x ? [] : Array.isArray(x) ? x : x.above ? x.above : [x];
    let dropCols = [];
    const layoutCol2Col = ({ contents, ...rest }) => {
      if (!contents) contents = rest;
      const col = {
        ...rest?.configuration,
        ...contents?.configuration,
        ...contents,
        ...rest,
        type: typeMap[contents.type] || contents.type,
      };
      switch (contents.type) {
        case "link":
          col.link_text = contents.text;
          col.link_url = contents.url;
          col.link_url_formula = contents.isFormula?.url;
          col.link_text_formula = contents.isFormula?.text;
          break;
        case "view_link":
          col.view_label_formula = contents.isFormula?.label;
          break;
        case "dropdown_menu":
          dropCols = [
            ...dropCols,
            ...toArray(contents.contents).map(layoutCol2Col),
          ];
          break;
        case "blank":
          if (contents.isFormula?.text) {
            col.type = "FormulaValue";
            col.formula = col.contents;
          }
          if (contents.isHTML)
            col.interpolator = (row) =>
              interpolate(contents.contents, row, req?.user);
          break;
        case "action":
          col.action_label_formula = contents.isFormula?.action_label;
          break;
        case "join_field":
          col.join_fieldview = contents.fieldview;
      }
      return col;
    };
    const newCols = layout.besides.map(layoutCol2Col);
    dropCols.forEach((c) => {
      c.in_dropdown = true;
    });
    const allNewCols = [...newCols, ...dropCols];
    //console.log(allNewCols);
    picked_fields_to_query(allNewCols, fields);
    await set_join_fieldviews({ columns: allNewCols, fields });
    return await get_tabulator_columns(
      viewname,
      table,
      fields,
      allNewCols,
      isShow,
      req,
      header_filters,
      vert_col_headers,
      dropdown_frozen
    );
  }

  const tabcols = [];
  const calculators = [];
  const dropdown_actions = [];
  const cellStyles = {};
  for (const column of columns) {
    let tcol = {};
    if (column.type === "Field") {
      let f = fields.find((fld) => fld.name === column.field_name);
      if (!f) return {};
      Object.assign(f.attributes, column);
      f.fieldview = column.fieldview;
      if (column.fieldview === "subfield") {
        tcol.editor = "__jsonSubEditor";

        tcol.field = f.name;

        tcol.formatter = "__jsonSubFormatter";
        tcol.title = column.key;

        tcol.headerFilter = !!header_filters;
        tcol.formatterParams = { subfield: column.key };
        tcol.editorParams = { subfield: column.key };
        //tcol.accessorDownload = "__jsonSubAccessor";
        //tcol.accessorDownloadParams = { subfield: column.key, field: f.name };
        set_json_col(tcol, f, column.key, header_filters);
      } else
        tcol = typeToGridType(f.type, f, header_filters, column, calculators);
      if (column.showif) tcol.showif = column.showif;
    } else if (column.type === "Text") {
      const rndid = "col" + hashCol(column);
      if (column.style) cellStyles[rndid] = column.style;
      calculators.push((row) => {
        if (column.showif && !eval_expression(column.showif, row, req.user)) {
          row[rndid] = "";
          return;
        }
        row[rndid] = column.interpolator
          ? column.interpolator(row)
          : text(column.contents);
      });
      tcol.field = rndid;
      tcol.headerFilter = !!header_filters && "input";
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
      if (typeof tcol.headerFilter === "undefined")
        tcol.headerFilter = !!header_filters;

      if (column.showif) tcol.showif = column.showif;
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
      if (column.agg_fieldview === "format" && column.format) {
        tcol.formatter = "__isoDateFormatter";
        tcol.formatterParams = {
          format: column.format,
        };
        tcol.field = targetNm;

        tcol.headerFilter = !!header_filters;
      } else if (column.agg_fieldview === "show_with_html") {
        tcol.formatter = "html";
        const rndid = "col" + hashCol(column);

        calculators.push((row) => {
          row[rndid] = row[targetNm]
            ? interpolate(column.configuration?.code || column.code, {
                it: row[targetNm],
              })
            : "";
        });
        tcol.field = rndid;
        tcol.headerFilter = !!header_filters && "input";
        tcol.editor = false;
      } else {
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
          if (column.showif && !eval_expression(column.showif, row, req.user)) {
            row[rndid] = "";
            return;
          }
          let value = row[targetNm];

          row[rndid] = showValue(value);
        });
        tcol.field = rndid; //db.sqlsanitize(targetNm);
        tcol.headerFilter = !!header_filters;
      }
    } else if (column.type === "FormulaValue") {
      const rndid = "col" + hashCol(column);
      if (column.style) cellStyles[rndid] = column.style;
      calculators.push((row) => {
        if (column.showif && !eval_expression(column.showif, row, req.user)) {
          row[rndid] = "";
          return;
        }
        row[rndid] = eval_expression(column.formula, row, req.user);
      });
      tcol.field = rndid;
      tcol.formatter = "html";
      tcol.headerFilter = !!header_filters && "input";
    } else if (column.type === "ViewLink") {
      tcol.formatter = "html";
      const rndid = "col" + hashCol(column);
      const { key } = view_linker(
        column,
        fields,
        req?.__ ? req.__ : (s) => s,
        isNode,
        req?.user,
        "",
        {},
        req,
        viewname,
        true //get label in data for sorting
      );
      calculators.push((row) => {
        if (column.showif && !eval_expression(column.showif, row, req.user)) {
          row[rndid] = "";
          return;
        }
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
        if (column.showif && !eval_expression(column.showif, row, req.user)) {
          row[rndid] = "";
          return;
        }
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
      //console.log("actioncol", column);
      const rndid = "col" + hashCol(column);
      calculators.push((row) => {
        if (column.showif && !eval_expression(column.showif, row, req.user)) {
          row[rndid] = "";
          return;
        }
        const url = action_url(
          viewname,
          table,
          column.action_name,
          row,
          column.rndid || column.action_name,
          column.rndid ? "rndid" : "action_name",
          column.confirm
        );
        const action_label =
          (column.icon ? i({ class: column.icon }) : "") +
          (column.action_label_formula
            ? eval_expression(column.action_label, row)
            : column.action_label || column.action_name);
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

        //scol.editor = false;
        //const key = `${fld}_${subfld}`;
        //calculators.push((row) => {
        //row[key] = (row[fld] || {})[subfld];
        //});
        scol.field = fld;
        scol.title = subfld;
        scol.editor = "__jsonSubEditor";
        scol.formatter = "__jsonSubFormatter";
        scol.formatterParams = { subfield: subfld };
        scol.editorParams = { subfield: subfld };
        //scol.accessorDownload = "__jsonSubAccessor";
        //scol.accessorDownloadParams = { subfield: subfld, field: fld };
        if (vert_col_headers) scol.headerVertical = true;
        set_json_col(scol, tcol.field, subfld, header_filters);
        tabcols.push(scol);
      }
      continue;
    }
    if (column.alignment && column.alignment !== "Default") {
      tcol.hozAlign = column.alignment.toLowerCase();
    }
    if (column.header_label) tcol.title = column.header_label;
    if (column.frozen) tcol.frozen = true;
    if (column.cssClass) tcol.cssClass = column.cssClass;
    if (column.disable_edit) tcol.editor = false;
    if (vert_col_headers) tcol.headerVertical = true;
    if (column.column_calculation) {
      tcol.bottomCalc = column.column_calculation;
      if (column.calc_dps)
        tcol.bottomCalcParams = { precision: column.calc_dps };
    }
    if (column.col_width)
      tcol.width =
        column.col_width_units === "%"
          ? `${column.col_width}%`
          : column.col_width;
    if (column.in_context_menu) tcol.in_context_menu = true;
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
    cellStyles,
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

function addFiveToColor(hexColor) {
  const decimalColor = parseInt(hexColor.replace("#", ""), 16);
  let red = (decimalColor >> 16) & 0xff;
  let green = (decimalColor >> 8) & 0xff;
  let blue = decimalColor & 0xff;
  red = Math.min(255, red + 5);
  green = Math.min(255, green + 5);
  blue = Math.min(255, blue + 5);
  return `#${((red << 16) | (green << 8) | blue)
    .toString(16)
    .padStart(6, "0")}`;
}

const getDarkStyle = async (req) => {
  const state = getState();
  const buildDarkStyle = ({ backgroundColorDark }) => {
    return backgroundColorDark
      ? `
    .tabulator-row, .tabulator-header, .tabulator-header-filter,
    .tabulator-footer, tabulator-footer-contents,
    .tabulator-col, tabulator-paginator,
    .tabulator * {
      background-color: ${backgroundColorDark} !important;
    }
    .tabulator-row-even * {
      background-color: ${addFiveToColor(backgroundColorDark)} !important;
    }
    `
      : null;
  };
  if (state.plugin_cfgs) {
    let anyBsThemeCfg = state.plugin_cfgs["any-bootstrap-theme"];
    if (!anyBsThemeCfg)
      anyBsThemeCfg = state.plugin_cfgs["@saltcorn/any-bootstrap-theme"];

    if (req.user?.id) {
      // does an user overwrite the global setting?
      const user = await User.findOne({ id: req.user.id });
      if (user?._attributes?.layout?.config?.mode) {
        if (user._attributes.layout.config.mode === "dark")
          return buildDarkStyle(anyBsThemeCfg);
        else return null;
      }
    }
    // does the global setting say dark mode?
    if (anyBsThemeCfg?.mode === "dark") return buildDarkStyle(anyBsThemeCfg);
  }
  return null;
};

module.exports = {
  typeToGridType,
  hashCol,
  nest,
  get_tabulator_columns,
  getDarkStyle,
  set_join_fieldviews,
};
