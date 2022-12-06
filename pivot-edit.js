const Field = require("@saltcorn/data/models/field");
const User = require("@saltcorn/data/models/user");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");

const Table = require("@saltcorn/data/models/table");
const { getState, features } = require("@saltcorn/data/db/state");
const db = require("@saltcorn/data/db");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const { eval_expression } = require("@saltcorn/data/models/expression");
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
          const fk_fields = fields.filter((f) => f.is_fkey);
          const fk_date_fields = fields.filter(
            (f) => f.is_fkey || f.type?.name === "Date"
          );
          const date_fields = fields.filter((f) => f.type?.name === "Date");
          return new Form({
            fields: [
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
                name: "value_field",
                label: "Value field",
                type: "String",
                required: true,
                attributes: {
                  options: fields.map((f) => f.name),
                },
              },
              {
                name: "vertical_headers",
                label: "Vertical headers",
                type: "Bool",
              },
            ],
          });
        },
      },
    ],
  });

const run = async (
  table_id,
  viewname,
  { row_field, col_field, value_field, vertical_headers, col_field_format },
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
        const dayStr = day.toISOString().split("T")[0];
        const xdayStr = xformCol(dayStr);
        col_values.add(
          col_field_format ? moment(day).format(col_field_format) : dayStr
        );
        rawColValues[xdayStr] = dayStr;
        day = new Date(day);
        day.setDate(day.getDate() + 1);
      }
    }
  }
  /*if (rowField.type?.name === "Date") {
    rows.forEach((r) => {
      if (r[row_field]) {
        r[row_field] = new Date(r[row_field]).toISOString().split("T")[0];
      }
    });
  }*/

  const allValues = {};
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
  const tabCols = [
    {
      field: "rowValue",
      title: rowField.label,
      editor: false,
    },
    ...[...col_values].map((cv) => ({
      ...valueCell,
      field: `${cv}`,
      title: `${cv}`,
      headerVertical: vertical_headers,
    })),
  ];
  const rndid = Math.floor(Math.random() * 16777215).toString(16);
  return (
    script(
      domReady(`
    const columns=${JSON.stringify(tabCols, null, 2)};   
   
    window.tabulator_table_${rndid} = new Tabulator("#tabgrid${viewname}", {
      data: ${JSON.stringify(Object.values(allValues), null, 2)},
      layout:"Columns", 
      columns,
      height:"100%",
      clipboard:true,
    });

  window.tabulator_table_${rndid}.on("cellEdited", function(cell){
    const rawColValues = ${JSON.stringify(rawColValues)};
    const row=cell.getRow().getData();
    const fld = cell.getField()
    const id = row.ids[fld]

    if(typeof row[fld]==="undefined") return;
    const saveRow = {${value_field}: row[fld]}
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
