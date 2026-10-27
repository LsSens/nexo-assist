import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/dev/reset");
  expect(response.ok()).toBeTruthy();
});

async function login(page: import("@playwright/test").Page, email: string, password = "qualquer") {
  await page.goto("/");
  await expect(page.getByTestId("login-form")).toHaveAttribute("data-ready", "1");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

test("atende a Ana, transfere para o Rafael e não vaza chamado", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("login-form")).toHaveAttribute("data-ready", "1");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.getByTestId("login-email").fill("ninguem@nexo.com.br");
  await page.getByTestId("login-password").fill("123");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("Não encontramos esse e-mail corporativo.")).toBeVisible();

  await login(page, "ana.souza@nexo.com.br");
  await expect(page.getByTestId("composer")).toBeVisible();

  await page.getByTestId("composer").fill("Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.");
  await page.getByTestId("send").click();
  await expect(page.getByText("Quem está sendo afetado?")).toBeVisible();
  await expect(page.getByText("consultou seus chamados").first()).toBeVisible();
  await expect(page.getByTestId("decision").first()).toContainText("Por que esta resposta");

  await page.getByTestId("composer").fill("Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.");
  await page.getByTestId("send").click();
  await expect(page.getByText("Aguardando confirmação")).toBeVisible();
  await expect(page.getByTestId("ticket-card")).toContainText("Alta");
  await page.getByTestId("confirm").click();
  await expect(page.getByText(/Pronto: abri o INC-/)).toBeVisible();

  await page.getByTestId("composer").fill("Qual o status do meu chamado?");
  await page.getByTestId("send").click();
  await expect(page.getByTestId("choice-INC-20311")).toBeVisible();
  await page.getByTestId("choice-INC-20311").click();
  await expect(page.getByText("acima do prazo de")).toBeVisible();
  await page.getByTestId("action-transfer").click();
  await expect(page.getByText("Aguardando atendente")).toBeVisible();

  await page.getByTestId("logout").click();
  await expect(page.getByTestId("login-form")).toHaveAttribute("data-ready", "1");
  await login(page, "rafael.lima@nexo.com.br");
  await expect(page.getByRole("heading", { name: "Conversas" })).toBeVisible();
  await page.getByRole("button", { name: /Ana Souza/ }).click();
  await expect(page.locator("header").getByText("Ana Souza")).toBeVisible();
  await page.getByTestId("assume").click();
  await expect(page.getByTestId("analyst-composer")).toBeVisible();
  await page.getByTestId("analyst-composer").fill("Oi Ana, sou o Rafael. Vou olhar o notebook.");
  await page.getByTestId("analyst-send").click();
  await expect(page.getByText("Oi Ana, sou o Rafael. Vou olhar o notebook.")).toBeVisible();

  await page.goto("/");
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
  await login(page, "ana.souza@nexo.com.br");
  await expect(page.getByText("Oi Ana, sou o Rafael. Vou olhar o notebook.")).toBeVisible();

  await page.getByTestId("logout").click();
  await expect(page.getByTestId("login-form")).toHaveAttribute("data-ready", "1");
  await login(page, "carla.mendes@nexo.com.br");
  await page.getByTestId("composer").fill("Qual o status do meu chamado?");
  await page.getByTestId("send").click();
  await expect(page.getByText("INC-20311")).toHaveCount(0);
  await expect(page.getByText("acesso ao SAP").first()).toBeVisible();
});
