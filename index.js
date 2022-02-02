const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");

const {
  text,
  div,
  h5,
  style,
  a,
  script,
  pre,
  domReady,
  i,
  text_attr,
} = require("@saltcorn/markup/tags");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async (context) => {
          return new Form({
            fields: [
              {
                name: "stylesheet",
                label: "Stylesheet",
                type: "String",
                required: true,
                attributes: {
                  options: [
                    "bootstrap4",
                    "midnight",
                    "modern",
                    "simple",
                    "site",
                  ],
                },
              },
            ],
          });
        },
      },
    ],
  });

const view_configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async (context) => {
          return new Form({
            fields: [],
          });
        },
      },
    ],
  });

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

const run = async (
  table_id,
  viewname,
  {
    show_view,
    column_field,
    view_to_create,
    expand_view,
    column_order,
    position_field,
    reload_on_drag,
    column_padding,
    col_bg_color = "#f0f0f0",
    col_text_color = "#000000",
    col_width,
    col_width_units,
    disable_column_reordering,
  },
  state,
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  readState(state, fields);
  const role = extraArgs.req.isAuthenticated()
    ? extraArgs.req.user.role_id
    : 10;
  const sview = await View.findOne({ name: show_view });
  if (!sview)
    return div(
      { class: "alert alert-danger" },
      "Kanban board incorrectly configured. Cannot find view: ",
      show_view
    );

  const sresps = await sview.runMany(state, extraArgs);
  if (position_field)
    await assign_random_positions(sresps, position_field, table_id);
  var cols = groupBy(sresps, ({ row }) => row[column_field]);
  let originalColNames = {};
  const column_field_field = fields.find((f) => f.name === column_field);
  if (
    column_field_field &&
    column_field_field.attributes &&
    column_field_field.attributes.options
  ) {
    var colOpts = column_field_field.attributes.options
      .split(",")
      .map((s) => s.trim());
    colOpts.forEach((col) => {
      if (!cols[col]) cols[col] = [];
    });
  } else if (column_field_field && column_field_field.type === "Key") {
    const reftable = await Table.findOne({
      name: column_field_field.reftable_name,
    });
    const refRows = await reftable.getRows();
    refRows.forEach((r) => {
      if (cols[r.id]) {
        cols[r[column_field_field.attributes.summary_field]] = cols[r.id];
        delete cols[r.id];
      } else cols[r[column_field_field.attributes.summary_field]] = [];
      originalColNames[r[column_field_field.attributes.summary_field]] = r.id;
    });
  }

  const ncols = Object.entries(cols).length;
  const sortCol = position_field
    ? (vs) => vs.sort((a, b) => a.row[position_field] - b.row[position_field])
    : (vs) => vs;
  const col_divs = orderedEntries(cols, column_order || []).map(([k, vs]) => {
    let maxpos = -10000;
    return div(
      { class: ["kancolwrap", col_width ? "setwidth" : "col-sm"] },
      div(
        {
          class: [
            "kancol card",
            `p-${typeof column_padding === "undefined" ? 1 : column_padding}`,
          ],
        },
        div(
          { class: "card-header" },
          h5({ class: "card-title" }, text_attr(k))
        ),
        div(
          { class: "kancontainer", "data-column-value": text_attr(k) },
          div(
            {
              class: "kancard kancard-empty-placeholder",
            },
            i("(empty)")
          ),
          sortCol(vs || []).map(({ row, html }) => {
            if (position_field && row[position_field] > maxpos)
              maxpos = row[position_field];
            return (
              div(
                {
                  class: "kancard card",
                  "data-id": text(row.id),
                  ...(expand_view && {
                    onClick: `href_to('/view/${expand_view}?id=${row.id}')`,
                  }),
                },
                html
              ) + "\n"
            );
          })
        ),
        view_to_create &&
          role <= table.min_role_write &&
          div(
            { class: "card-footer" },
            a(
              {
                class: "card-link",
                href: `/view/${text(view_to_create)}?${text_attr(
                  column_field
                )}=${text_attr(originalColNames[k] || k)}${position_setter(
                  position_field,
                  maxpos
                )}`,
              },
              i({ class: "fas fa-plus-circle mr-1" }),
              "Add new card"
            )
          )
      )
    );
  });
  return div(
    { class: ["kanboardwrap", col_width ? "setwidth" : ""] },
    div({ class: ["kanboard", col_width ? "setwidth" : "row"] }, col_divs) +
      //pre(JSON.stringify({table, name:table.name}))+
      style(
        css({ ncols, col_bg_color, col_text_color, col_width, col_width_units })
      ) +
      script(
        domReady(
          js(
            table.name,
            column_field,
            viewname,
            reload_on_drag,
            disable_column_reordering
          )
        )
      )
  );
};

//card has been dragged btw columns
const set_card_value = async (
  table_id,
  viewname,
  { column_field, position_field },
  body,
  { req }
) => {
  const table = await Table.findOne({ id: table_id });
  const role = req.isAuthenticated() ? req.user.role_id : 10;
  if (role > table.min_role_write) {
    return { json: { error: "not authorized" } };
  }
  let colval = body[column_field];
  const fields = await table.getFields();
  const column_field_field = fields.find((f) => f.name === column_field);
  if (column_field_field && column_field_field.type === "Key") {
    const reftable = await Table.findOne({
      name: column_field_field.reftable_name,
    });
    const refrow = await reftable.getRow({
      [column_field_field.attributes.summary_field]: body[column_field],
    });
    colval = refrow.id;
  }
  if (position_field) {
    var newpos;
    const exrows = await table.getRows(
      { [column_field]: colval },
      { orderBy: position_field }
    );
    const before_id = parseInt(body.before_id);
    if (before_id) {
      const before_ix = exrows.findIndex((row) => row.id === before_id);
      if (before_ix === 0) newpos = exrows[0][position_field] - 1;
      else
        newpos =
          (exrows[before_ix - 1][position_field] +
            exrows[before_ix][position_field]) /
          2;
    } else {
      if (exrows.length > 0)
        newpos = exrows[exrows.length - 1][position_field] + 1;
      else newpos = Math.random();
    }

    await table.updateRow(
      { [column_field]: colval, [position_field]: newpos },
      parseInt(body.id)
    );
  } else {
    await table.updateRow({ [column_field]: colval }, parseInt(body.id));
  }

  return { json: { success: "ok" } };
};

//whole column has been moved
const set_col_order = async (table_id, viewname, config, body, { req }) => {
  const table = await Table.findOne({ id: table_id });

  const role = req.isAuthenticated() ? req.user.role_id : 10;
  if (role > table.min_role_write) {
    return { json: { error: "not authorized" } };
  }
  const view = await View.findOne({ name: viewname });
  const newConfig = {
    configuration: { ...view.configuration, column_order: body },
  };
  await View.update(newConfig, view.id);
  return { json: { success: "ok", newconfig: newConfig } };
};
module.exports = {
  headers: ({ stylesheet }) => [
    {
      script: "/plugins/public/tabulator/dragula.min.js",
    },
    {
      css: `/plugins/public/tabulator/tabulator_${stylesheet}.min.css`,
    },
  ],
  sc_plugin_api_version: 1,
  plugin_name: "tabulator",
  configuration_workflow,
  viewtemplates: () => [
    {
      name: "Tabulator",
      display_state_form: false,
      get_state_fields,
      configuration_workflow: view_configuration_workflow,
      run,
      routes: { set_col_order, set_card_value },
    },
  ],
};
