const Field = require("@saltcorn/data/models/field");
const User = require("@saltcorn/data/models/user");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");

const Table = require("@saltcorn/data/models/table");
const { getState, features } = require("@saltcorn/data/db/state");
const db = require("@saltcorn/data/db");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const {
  jsexprToWhere,
  eval_expression,
} = require("@saltcorn/data/models/expression");
const {
  parse_view_select,
} = require("@saltcorn/data/base-plugin/viewtemplates/viewable_fields");
const {
  field_picker_fields,
  picked_fields_to_query,
  stateFieldsToWhere,
  initial_config_all_fields,
  stateToQueryString,
  stateFieldsToQuery,
  link_view,
  getActionConfigFields,
  readState,
  run_action_column,
} = require("@saltcorn/data/plugin-helper");
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
} = require("@saltcorn/markup/tags");
const { typeToGridType, nest, get_tabulator_columns } = require("./common");
const moment = require("moment");

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table = Table.findOne(table_id);
  const table_fields = table.fields;
  return table_fields
    .filter((f) => !f.primary_key)
    .map((f) => {
      const sf = new Field(f);
      sf.required = false;
      return sf;
    });
};

const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "Pivot grid",
        form: async (context) => {
          const table = await Table.findOne(
            context.table_id
              ? { id: context.table_id }
              : { name: context.exttable_name }
          );
          const fields = await table.getFields();
          const fk_fields = fields.filter((f) => f.is_fkey && f.reftable_name);
          const fk_date_fields = fields.filter(
            (f) => (f.is_fkey && f.reftable_name) || f.type?.name === "Date"
          );
          const date_fields = fields.filter((f) => f.type?.name === "Date");
          const group_by_options = {};
          for (const fk_field of fk_fields) {
            const reftable = Table.findOne({ name: fk_field.reftable_name });
            if (reftable) {
              const reffields = await reftable.getFields();
              group_by_options[fk_field.name] = [
                "",
                ...reffields.map((f) => f.name),
              ];
            }
          }
          const edit_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewrow.name !== context.viewname
          );
          const edit_view_opts = edit_views.map((v) => v.name);
          return new Form({
            fields: [
              { input_type: "section_header", label: "Rows" },
              {
                name: "row_field",
                label: "Row field",
                type: "String",
                required: true,
                attributes: {
                  options: fk_fields.map((f) => f.name),
                },
              },
              {
                name: "row_where",
                label: "Where",
                sublabel: "include the rows that match this formula",
                type: "String",
              },
              {
                name: "groupBy",
                label: "Group by",
                type: "String",
                attributes: {
                  calcOptions: ["row_field", group_by_options],
                },
              },
              {
                input_type: "section_header",
                label: "Columns",
                disabled: true,
              },
              {
                name: "col_field",
                label: "Column field",
                type: "String",
                required: true,
                attributes: {
                  options: fk_date_fields.map((f) => f.name),
                },
              },
              {
                name: "col_field_format",
                label: "Column format",
                type: "String",
                sublabel: "moment.js format specifier",
                showIf: {
                  col_field: date_fields.map((f) => f.name),
                },
              },
              {
                name: "col_bin_weeks",
                label: "Weekly columns",
                type: "Bool",
                sublabel: "Instead of daily",
                showIf: {
                  col_field: date_fields.map((f) => f.name),
                },
              },
              {
                name: "col_no_weekends",
                label: "No weekend columns",
                type: "Bool",
                sublabel: "Exclude weekend days from columns",
                showIf: {
                  col_field: date_fields.map((f) => f.name),
                  col_bin_weeks: false,
                },
              },
              {
                name: "col_width",
                label: "Column width (px)",
                sublabel: "Optional",
                type: "Integer",
              },
              {
                name: "vertical_headers",
                label: "Vertical headers",
                type: "Bool",
              },
              { input_type: "section_header", label: "Values" },

              {
                name: "value_field",
                label: "Value field",
                type: "String",
                required: true,
                attributes: {
                  options: fields.map((f) => f.name),
                },
              },
              {
                name: "edit_view",
                label: "Edit view",
                sublabel: "Edit in pop-up view instead of directly in cell",
                type: "String",
                required: false,
                attributes: {
                  options: edit_view_opts,
                },
              },
              {
                name: "new_row_formula",
                label: "New row formula",
                sublabel:
                  "Formula for JavaScript object that will be added to new rows, in addition to values for row, column and value fields. State variable may be used here.",
                type: "String",
                class: "validate-expression",
              },
              { input_type: "section_header", label: "Calculated row" },

              {
                name: "column_calculation",
                label: "Column Calculation",
                type: "String",
                attributes: {
                  options: ["avg", "max", "min", "sum", "count"],
                },
              },
              {
                name: "group_calcs",
                label: "Group calculations",
                type: "Bool",
                sublabel: "Calculations by group",
                showIf: {
                  column_calculation: ["avg", "max", "min", "sum", "count"],
                },
              },
              {
                name: "calc_pos",
                label: "Calculation position",
                type: "String",
                fieldview: "radio_group",
                attributes: {
                  options: ["Top", "Bottom"],
                  inline: true,
                },
                showIf: {
                  column_calculation: ["avg", "max", "min", "sum", "count"],
                },
              },
              {
                name: "target_value",
                label: "Target value",
                sublabel:
                  "Optional. Show matching columns in blue, others in red",
                type: "Integer",
                showIf: {
                  column_calculation: ["avg", "max", "min", "sum", "count"],
                },
              },
            ],
          });
        },
      },
      {
        name: "Additional columns",
        form: async (context) => {
          const celltable = await Table.findOne(
            context.table_id
              ? { id: context.table_id }
              : { name: context.exttable_name }
          );
          //console.log(context);
          const row_field = await celltable.getField(context.row_field);
          const table = Table.findOne(row_field.reftable_name);
          const field_picker_repeat = await field_picker_fields({
            table,
            viewname: context.viewname,
            req,
          });
          field_picker_repeat.push({
            name: "frozen",
            label: "Frozen",
            type: "Bool",
          });
          field_picker_repeat.push({
            name: "disable_edit",
            label: "Disable editing",
            type: "Bool",
            showIf: { type: "Field" },
          });
          field_picker_repeat.push({
            name: "column_calculation",
            label: "Column Calculation",
            type: "String",
            attributes: {
              options: [
                "avg",
                "max",
                "min",
                "sum",
                "count",
                { name: "__tabulator_colcalc_unique", label: "count unique" },
                { name: "__tabulator_colcalc_counttrue", label: "count true" },
                {
                  name: "__tabulator_colcalc_countfalse",
                  label: "count false",
                },
                {
                  name: "__tabulator_colcalc_avgnonulls",
                  label: "avg no nulls",
                },
                {
                  name: "__tabulator_colcalc_sumroundquarter",
                  label: "sum round to quarter",
                },
              ],
            },
          });
          field_picker_repeat.push({
            name: "calc_dps",
            label: "Calculation decimal places",
            type: "Integer",
            showIf: {
              column_calculation: [
                "avg",
                "max",
                "min",
                "sum",
                "__tabulator_colcalc_avgnonulls",
              ],
            },
          });
          const use_field_picker_repeat = field_picker_repeat.filter(
            (f) => !["state_field", "col_width_units"].includes(f.name)
          );
          field_picker_repeat.find((c) => c.name === "col_width").label =
            "Column width (px)";
          const fvs = field_picker_repeat.filter((c) => c.name === "fieldview");
          fvs.forEach((fv) => {
            if (fv?.attributes?.calcOptions?.[1])
              Object.values(fv.attributes.calcOptions[1]).forEach((fvlst) => {
                if (fvlst[0] === "as_text") fvlst.push("textarea");
              });
          });
          // fix legacy values missing view_name
          (context?.columns || []).forEach((column) => {
            if (
              column.type === "ViewLink" &&
              column.view &&
              !column.view_name
            ) {
              const view_select = parse_view_select(column.view);
              column.view_name = view_select.viewname;
            }
          });
          return new Form({
            fields: [
              new FieldRepeat({
                name: "columns",
                fancyMenuEditor: true,
                fields: use_field_picker_repeat,
              }),
            ],
          });
        },
      },
      {
        name: "Additional options",
        form: async (context) => {
          const celltable = await Table.findOne(
            context.table_id
              ? { id: context.table_id }
              : { name: context.exttable_name }
          );
          //console.log(context);
          const row_field = await celltable.getField(context.row_field);
          const table = Table.findOne(row_field.reftable_name);
          const fields = table.fields;
          for (const field of fields) {
            await field.fill_fkey_options();
          }
          let tree_field_options = [];
          //self join
          for (const field of fields) {
            if (field.is_fkey && field.reftable_name == table.name)
              tree_field_options.push(field.name);
          }
          return new Form({
            fields: [
              {
                name: "tree_field",
                label: "Tree field",
                type: "String",
                attributes: {
                  options: tree_field_options,
                },
              },
              {
                name: "row_order_field",
                label: "Row order by",
                type: "String",
                attributes: {
                  options: fields.map((f) => f.name),
                },
              },
              {
                name: "row_order_desc",
                label: "Descending?",
                type: "Bool",
                showIf: { row_order_field: fields.map((f) => f.name) },
              },
              {
                name: "disable_edit_if",
                label: "Disable row edit if",
                sublabel: "Formula",
                type: "String",
                class: "validate-expression",
              },
              {
                name: "fit",
                label: "Layout Fit",
                type: "String",
                required: true,
                attributes: {
                  options: [
                    "Columns",
                    "Data",
                    "DataFill",
                    "DataStretch",
                    "DataTable",
                  ],
                },
              },
              {
                name: "header_wrap",
                label: "Wrap column headers",
                type: "Bool",
              },
            ],
          });
        },
      },
    ],
  });

const isWeekend = (date) => ((d) => d === 0 || d === 6)(date.getDay());

const get_db_rows = async (
  table,
  fields,
  viewname,
  {
    row_field,
    col_field,
    value_field,
    vertical_headers,
    col_field_format,
    new_row_formula,
    column_calculation,
    row_where,
    groupBy,
    col_no_weekends,
    group_calcs,
    calc_pos,
    col_width,
    target_value,
    edit_view,
    col_bin_weeks,
    columns,
    disable_edit_if,
    tree_field,
    row_order_field,
    row_order_desc,
    header_wrap,
  },
  state,
  extraArgs
) => {
  readState(state, fields);
  const where = await stateFieldsToWhere({ fields, state });
  const q = await stateFieldsToQuery({ state, fields, prefix: "a." });

  const rowField = fields.find((f) => f.name === row_field);
  const colField = fields.find((f) => f.name === col_field);
  const valField = fields.find((f) => f.name === value_field);
  const rowTable = Table.findOne(rowField.reftable_name);

  const joinFields = {};
  let row_field_name = row_field;
  let col_field_name = col_field;
  if (rowField?.attributes?.summary_field) {
    joinFields["rowfield"] = {
      ref: row_field,
      target: rowField?.attributes?.summary_field,
    };
    row_field_name = "rowfield";
  }
  if (colField?.attributes?.summary_field) {
    joinFields["colField"] = {
      ref: col_field,
      target: colField?.attributes?.summary_field,
    };
    col_field_name = "colfield";
  }

  let rows = await table.getJoinedRows({
    where,
    joinFields,
    ...q,
    forPublic: !extraArgs.req.user,
    forUser: extraArgs.req.user,
  });
  const row_values = new Set([]);
  const col_values = new Set([]);
  const rawColValues = {};
  const allValues = {};
  let xformCol = (x) => x;

  if (colField.type?.name === "Date") {
    rows.forEach((r) => {
      if (r[col_field]) {
        r[col_field] = new Date(r[col_field]).toISOString().split("T")[0];
      }
    });
    //if (col_field_format)
    //  xformCol = (day) => moment(day).format(col_field_format);
    if (state["_fromdate_" + col_field] && state["_todate_" + col_field]) {
      let start = new Date(state["_fromdate_" + col_field]);
      let end = new Date(state["_todate_" + col_field]);
      let day = start;
      if (col_bin_weeks) {
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        end.setDate(end.getDate() - ((end.getDay() + 6) % 7));
      }
      while (day <= end) {
        if (!col_no_weekends || !isWeekend(day) || col_bin_weeks) {
          const dayStr = day.toISOString().split("T")[0];
          const xdayStr = xformCol(dayStr);
          col_values.add(
            //col_field_format ? moment(day).format(col_field_format) :
            dayStr
          );
          rawColValues[xdayStr] = dayStr;
        }
        day = new Date(day);
        day.setDate(day.getDate() + (col_bin_weeks ? 7 : 1));
      }
    }
  }

  if (rowField.is_fkey && rowField.reftable_name) {
    const reftable = Table.findOne({ name: rowField.reftable_name });
    const reffields = await reftable.getFields();

    const { joinFields, aggregations } = picked_fields_to_query(
      columns || [],
      reffields
    );
    let groupBy1 = groupBy;
    if (groupBy) {
      const groupField = reffields.find((f) => f.name === groupBy);
      if (groupField.is_fkey && groupField.attributes?.summary_field) {
        joinFields.groupbyval = {
          target: groupField.attributes?.summary_field,
          ref: groupBy,
        };
        groupBy1 = "groupbyval";
      }
    }

    const rowWhere = row_where ? jsexprToWhere(row_where) : {};
    if (where[row_field]) {
      rowWhere[reftable.pk_name] = where[row_field];
    }

    const refVals = await reftable.getJoinedRows({
      where: rowWhere,
      joinFields,
      aggregations,
      orderBy: row_order_field || undefined,
      orderDesc: row_order_desc || undefined,
    });
    refVals.forEach((refRow) => {
      const value = refRow[reftable.pk_name];
      const label = refRow[rowField.attributes.summary_field];
      row_values.add(label);
      allValues[label] = {
        rawRowValue: value,
        rowValue: label,
        groupVal: groupBy ? refRow[groupBy1] : undefined,
        ids: {},
        ...refRow,
      };
      if (disable_edit_if) {
        if (eval_expression(disable_edit_if, refRow))
          allValues[label]._disable_edit = true;
      }
    });
  }
  if (colField.is_fkey) {
    await colField.fill_fkey_options();
    colField.options.forEach(({ label, value }) => {
      col_values.add(label);
      rawColValues[label] = value;
    });
  }
  /*if (rowField.type?.name === "Date") {
    rows.forEach((r) => {
      if (r[row_field]) {
        r[row_field] = new Date(r[row_field]).toISOString().split("T")[0];
      }
    });
  }*/

  for (const r of rows) {
    const rowValue = r[row_field_name];
    const colValue = xformCol(r[col_field_name]);
    row_values.add(rowValue);
    col_values.add(colValue);
    if (!allValues[rowValue]) {
      allValues[rowValue] = {
        rawRowValue: r[row_field],
        rowValue,
        ids: {},
      };
    }
    const theCell = r[value_field];
    if (allValues[rowValue][colValue]) {
      //MULTIPLE PRESENT
      allValues[rowValue][
        colValue
      ] = `${allValues[rowValue][colValue]} ${theCell}`;
    } else {
      allValues[rowValue][colValue] = theCell;
      allValues[rowValue].ids[colValue] = r[table.pk_name];
      rawColValues[colValue] = r[col_field];
    }
  }

  const valueCell0 = typeToGridType(
    valField.type,
    valField,
    false,
    {
      type: "Field",
    },
    {}
  );
  const valueCell = edit_view
    ? { ...valueCell0, editor: false, cellClick: "__pivot_edit_popup" }
    : valueCell0;
  const colValuesArray = [...col_values];
  if (colField.type?.name === "Date") {
    colValuesArray.sort((a, b) => {
      const da = new Date(rawColValues[a]);
      const db = new Date(rawColValues[b]);
      return da > db ? 1 : db > da ? -1 : 0;
    });
  }

  const { tabcolumns, dropdown_id, dropdown_actions, calculators } =
    await get_tabulator_columns(
      viewname,
      rowTable,
      rowTable.fields,
      columns || [],
      false,
      extraArgs.req,
      false, //header_filters,
      false,
      false
    );

  const tabCols = [
    {
      field: "rowValue",
      title: rowField.label,
      editor: false,
      frozen: true,
    },
    ...tabcolumns,
    ...colValuesArray.map((cv) => ({
      ...valueCell,
      field: `${cv}`,
      title: col_field_format ? moment(cv).format(col_field_format) : `${cv}`,
      editable: "__pivotEditCheck",
      headerVertical: vertical_headers,
      [(calc_pos || "Bottom").toLowerCase() + "Calc"]:
        (group_calcs || !groupBy) && column_calculation
          ? column_calculation
          : undefined,
      headerWordWrap: true,
      width: col_width || undefined,
    })),
  ];

  tabCols.forEach((col) => {
    if (disable_edit_if && !col.editable)
      col.editable = "__tabulator_edit_check";
    if (header_wrap) col.headerWordWrap = true;
  });

  let allValuesArray = Object.values(allValues);
  calculators.forEach((f) => {
    allValuesArray.forEach(f);
  });

  if (tree_field) {
    const my_ids = new Set(allValuesArray.map((r) => r.id));
    for (const row of allValuesArray) {
      if (row[tree_field] && my_ids.has(row[tree_field]))
        row._parent = row[tree_field];
      else row._parent = null;
    }
    allValuesArray = nest(allValuesArray);
  }

  if (groupBy && !group_calcs && column_calculation) {
    const calcRow = {
      ids: {},
      disableEdit: true,
      rowValue: column_calculation,
      groupVal: "Total",
    };
    colValuesArray.forEach((cv) => {
      let result;
      //["avg", "max", "min", "sum", "count"]
      const values = [...row_values].map((rv) => allValues[rv][cv]);
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
      calcRow[cv] = result;
    });
    if (calc_pos === "Top") allValuesArray.unshift(calcRow);
    else allValuesArray.push(calcRow);
    //row_values.add(column_calculation);
  }
  return {
    tabCols,
    allValuesArray,
    col_field_name,
    tabcolumns,
    rowField,
    rawColValues,
    valueCell,
  };
};

const run = async (table_id, viewname, config, state, extraArgs) => {
  const {
    row_field,
    col_field,
    value_field,
    vertical_headers,
    col_field_format,
    new_row_formula,
    column_calculation,
    row_where,
    groupBy,
    col_no_weekends,
    group_calcs,
    calc_pos,
    col_width,
    target_value,
    edit_view,
    col_bin_weeks,
    columns,
    disable_edit_if,
    tree_field,
    row_order_field,
    row_order_desc,
    fit,
  } = config;
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  const {
    tabCols,
    allValuesArray,
    col_field_name,
    tabcolumns,
    rowField,
    rawColValues,
    valueCell,
  } = await get_db_rows(table, fields, viewname, config, state, extraArgs);

  const rndid = Math.floor(Math.random() * 16777215).toString(16);
  const newRowState = {};
  Object.entries(state).forEach(([k, v]) => {
    if (k.includes(".") || k.includes("-") || k.includes(">")) return;
    newRowState[k] = v;
  });
  const new_row_obj = new_row_formula
    ? eval_expression(new_row_formula, {
        ...newRowState,
        user: extraArgs.req.user,
      })
    : {};
  return (
    script(
      domReady(`
    const columns=${JSON.stringify(tabCols, null, 2)};   
    columns.forEach(col=>{
      Object.entries(col).forEach(([k,v])=>{
        if(typeof v === "string" && v.startsWith("__")) {
          col[k] = window[v.substring(2)];
        }
      })
    })
    window.tabulator_table_${rndid} = new Tabulator("#tabgrid${viewname.replaceAll(
        " ",
        ""
      )}${rndid}", {
      data: ${JSON.stringify(allValuesArray, null, 2)},
      layout:"fit${fit || "Columns"}", 
      columns,
      clipboard:true,  
      ${
        disable_edit_if
          ? `rowFormatter: function(row) {
        if(row.getData()._disable_edit) {
          row.getElement().style.backgroundColor = "#cccccc";
        }
      },`
          : ``
      }
      ${
        tree_field
          ? "dataTree:true,dataTreeStartExpanded:true,dataTreeSelectPropagate:true,"
          : ""
      }
      ${groupBy ? `groupBy: "groupVal",` : ""}
      ${
        groupBy && !group_calcs && column_calculation && calc_pos === "Top"
          ? `frozenRows:1`
          : ""
      }
    });
  ${
    edit_view
      ? `
  window.pivot_tabulator_edit_view = '${edit_view}';
  window.pivot_tabulator_table_pk = '${table.pk_name}';
  window.pivot_tabulator_row_field = '${row_field}';
  window.pivot_tabulator_col_field_name = '${col_field_name}';
  `
      : ""
  }

  window.tabulator_table_${rndid}.on("cellEdited", function(cell){
    if(${JSON.stringify(
      tabcolumns.map((c) => c.field)
    )}.includes(cell.getField())) {
      const row=cell.getRow().getData();
      gen_save_row_from_cell(${JSON.stringify({
        rndid,
        table_name: rowField.reftable_name,
        viewname,
        hasCalculated: true,
      })})(row, cell);
      return;
    }
    const rawColValues = ${JSON.stringify(rawColValues)};
    const row=cell.getRow().getData();
    if(row.disableEdit) return;
    const fld = cell.getField()
    const id = row.ids[fld]
    let value = row[fld]
    if(value==="" && ${JSON.stringify(valueCell.editor === "number")}) {
      value = 0
      cell.setValue(0)
    }
    const saveRow = {...${JSON.stringify(new_row_obj)}, ${value_field}: value}
    if(!id) {
      saveRow.${row_field} = row.rawRowValue;
      saveRow.${col_field} = rawColValues[fld];
      saveRow._rowId = row.rawRowValue;
    } else {
      saveRow._rowId = row.rawRowValue;
      saveRow.id = id
    }
    saveRow._state = ${JSON.stringify(state)}
    $.ajax({
      type: "POST",
      url: "/view/${viewname}/edit_value",
      data: saveRow,
      headers: {
        "CSRF-Token": _sc_globalCsrf,
      },
      error: tabulator_error_handler,
    }).done(function (resp) {
      if(Array.isArray(resp.success)) {
        window.tabulator_table_${rndid}.updateRow(cell.getRow(), resp.success[0]);       
      }
      ${
        groupBy && !group_calcs && column_calculation
          ? `pivotEditRecalc(cell, ${JSON.stringify({
              column_calculation,
              calc_pos,
            })});${target_value ? "setCalcColors();" : ""}`
          : ""
      }
    })
  });
  ${
    target_value
      ? `const setCalcColors = ()=> {
        const rows = window.tabulator_table_${rndid}.getRows();
      const wantIx = ${calc_pos === "Top" ? 0 : `rows.length-1`};
      const [cell0, ...cells] = rows[wantIx].getCells()
      for(const cell of cells) {
        const data = cell.getValue()
        if(data===${target_value})
          cell.getElement().style.color = "blue";
        else 
          cell.getElement().style.color = "red";

      }
    };
    setTimeout(setCalcColors)
    `
      : ""
  }
    `)
    ) +
    div({
      id: `tabgrid${viewname.replaceAll(" ", "")}${rndid}`,
      style: { height: "100%" },
    })
  );
};

const edit_value = async (table_id, viewname, config, body, { req, res }) => {
  const {
    row_field,
    col_field,
    value_field,
    vertical_headers,
    col_field_format,
    new_row_formula,
    column_calculation,
    row_where,
    groupBy,
    col_no_weekends,
    group_calcs,
    calc_pos,
    col_width,
  } = config;
  let { id, _rowId, _state, ...rowValues } = body;
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();

  if (id) {
    await table.updateRow(rowValues, id, req.user);
  } else {
    id = await table.insertRow(rowValues, req.user);
  }
  const { allValuesArray } = await get_db_rows(
    table,
    fields,
    viewname,
    config,
    { [config.row_field]: _rowId, ...(_state || {}) },
    { req, res }
  );
  return {
    json: {
      success: _rowId
        ? allValuesArray.filter((xs) => xs.groupVal !== "Total")
        : allValuesArray,
    },
  };
};

const get_rows = async (table_id, viewname, config, body, extraArgs) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();

  const state = body.state?.id ? { [config.row_field]: body.state.id } : {};
  const {
    tabCols,
    allValuesArray,
    col_field_name,
    tabcolumns,
    rowField,
    rawColValues,
    valueCell,
  } = await get_db_rows(table, fields, viewname, config, state, extraArgs);
  return {
    json: {
      success: body.state?.id
        ? allValuesArray.filter((xs) => xs.groupVal !== "Total")
        : allValuesArray,
    },
  };
};

module.exports = {
  name: "Tabulator Pivot Edit",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
  routes: {
    edit_value,
    get_rows,
  },
};
