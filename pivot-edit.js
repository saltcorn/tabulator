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
const { typeToGridType } = require("./common");
const moment = require("moment");

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table_fields = await Field.find({ table_id });
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
        name: "Columns",
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
              { input_type: "section_header", label: "Columns" },
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
                name: "col_no_weekends",
                label: "No weekend columns",
                type: "Bool",
                sublabel: "Exclude weekend days from columns",
                showIf: {
                  col_field: date_fields.map((f) => f.name),
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
            ],
          });
        },
      },
    ],
  });

const isWeekend = (date) => ((d) => d === 0 || d === 6)(date.getDay());

const run = async (
  table_id,
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
  },
  state,
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  readState(state, fields);
  const where = await stateFieldsToWhere({ fields, state });
  const q = await stateFieldsToQuery({ state, fields, prefix: "a." });
  const rowField = fields.find((f) => f.name === row_field);
  const colField = fields.find((f) => f.name === col_field);
  const valField = fields.find((f) => f.name === value_field);

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
    if (col_field_format)
      xformCol = (day) => moment(day).format(col_field_format);
    if (state["_fromdate_" + col_field] && state["_todate_" + col_field]) {
      const start = new Date(state["_fromdate_" + col_field]);
      const end = new Date(state["_todate_" + col_field]);
      let day = start;
      while (day <= end) {
        if (!col_no_weekends || !isWeekend(day)) {
          const dayStr = day.toISOString().split("T")[0];
          const xdayStr = xformCol(dayStr);
          col_values.add(
            col_field_format ? moment(day).format(col_field_format) : dayStr
          );
          rawColValues[xdayStr] = dayStr;
        }
        day = new Date(day);
        day.setDate(day.getDate() + 1);
      }
    }
  }

  if (rowField.is_fkey && rowField.reftable_name) {
    const reftable = Table.findOne({ name: rowField.reftable_name });
    const reffields = await reftable.getFields();

    const joinFields = {};
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
    const refVals = await reftable.getJoinedRows({
      where: row_where ? jsexprToWhere(row_where) : {},
      joinFields,
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
      };
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

  rows.forEach((r) => {
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
    if (allValues[rowValue][colValue]) {
      //MULTIPLE PRESENT
      allValues[rowValue][
        colValue
      ] = `${allValues[rowValue][colValue]},${r[value_field]}`;
    } else {
      allValues[rowValue][colValue] = r[value_field];
      allValues[rowValue].ids[colValue] = r[table.pk_name];
      rawColValues[colValue] = r[col_field];
    }
  });
  const valueCell = typeToGridType(
    valField.type,
    valField,
    false,
    {
      type: "Field",
    },
    {}
  );
  const colValuesArray = [...col_values];
  if (colField.type?.name === "Date") {
    colValuesArray.sort((a, b) => {
      const da = new Date(rawColValues[a]);
      const db = new Date(rawColValues[b]);
      return da > db ? 1 : db > da ? -1 : 0;
    });
  }
  const tabCols = [
    {
      field: "rowValue",
      title: rowField.label,
      editor: false,
      frozen: true,
    },
    ...colValuesArray.map((cv) => ({
      ...valueCell,
      field: `${cv}`,
      title: `${cv}`,
      headerVertical: vertical_headers,
      [(calc_pos || "Bottom").toLowerCase() + "Calc"]:
        (group_calcs || !groupBy) && column_calculation
          ? column_calculation
          : undefined,
      headerWordWrap: true,
      width: col_width || undefined,
    })),
  ];
  const allValuesArray = Object.values(allValues);

  if (groupBy && !group_calcs && column_calculation) {
    const calcRow = {
      ids: {},
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
  const rndid = Math.floor(Math.random() * 16777215).toString(16);
  const new_row_obj = new_row_formula
    ? eval_expression(new_row_formula, { ...state, user: extraArgs.req.user })
    : {};
  return (
    script(
      domReady(`
    const columns=${JSON.stringify(tabCols, null, 2)};   
   
    window.tabulator_table_${rndid} = new Tabulator("#tabgrid${viewname}", {
      data: ${JSON.stringify(allValuesArray, null, 2)},
      layout:"Columns", 
      columns,
      height:"100%",
      clipboard:true,
      ${groupBy ? `groupBy: "groupVal"` : ""}
    });

  window.tabulator_table_${rndid}.on("cellEdited", function(cell){
    const rawColValues = ${JSON.stringify(rawColValues)};
    const row=cell.getRow().getData();
    const fld = cell.getField()
    const id = row.ids[fld]

    if(typeof row[fld]==="undefined") return;
    const saveRow = {...${JSON.stringify(
      new_row_obj
    )}, ${value_field}: row[fld]}
    if(!id) {
      saveRow.${row_field} = row.rawRowValue;
      saveRow.${col_field} = rawColValues[fld];
    }
    $.ajax({
      type: "POST",
      url: "/api/${table.name}/" +( id ||""),
      data: saveRow,
      headers: {
        "CSRF-Token": _sc_globalCsrf,
      },
      error: tabulator_error_handler,
    }).done(function (resp) {
      if(resp.success &&typeof resp.success ==="number" && !row.id && cell) {
        window.tabulator_table_${rndid}.updateRow(cell.getRow(), {id: resp.success});
      }
    })
  });
    `)
    ) + div({ id: `tabgrid${viewname}` })
  );
};
module.exports = {
  name: "Tabulator Pivot Edit",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
};
