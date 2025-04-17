const commands = [
  {
    name: "store",
    description: "Search for a store",
    options: [
      {
        name: "store",
        description: "Store to search for",
        type: 3, // STRING type
        required: true,
        autocomplete: true,
      },
    ],
  },
];

export async function registerCommands(params: {
  applicationId: string;
  botToken: string;
}) {
  const endpoint = `https://discord.com/api/v10/applications/${params.applicationId}/commands`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${params.botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    throw new Error(`Error registering commands: ${response.statusText}`);
  }
}
