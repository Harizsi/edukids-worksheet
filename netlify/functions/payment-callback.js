const crypto = require("crypto");
const { getStore, connectLambda } = require("@netlify/blobs");
const { PRODUCTS } = require("./_shared/products");

/*
   Ini URL yang Sir letak sebagai billCallbackUrl semasa create bill.
   ToyyibPay panggil URL ini dari SERVER dia (bukan browser customer),
   jadi ini sumber yang BOLEH DIPERCAYAI untuk sahkan pembayaran betul-betul berjaya.

   Callback tidak berfungsi di localhost - kena test di URL Netlify sebenar
   (boleh guna Netlify deploy preview / production URL).
*/

// Hantar email confirmation + link download guna Resend API.
// Kalau email gagal hantar, kita LOG sahaja - tak patut buat seluruh
// callback gagal (order tetap kena mark "paid" walaupun email gagal),
// sebab link download tetap ada di payment-success.html.
async function sendConfirmationEmail(customer, downloadLinks) {
    if (!process.env.RESEND_API_KEY) {
        console.log("RESEND_API_KEY tak diset - skip hantar email.");
        return;
    }

    const linksHtml = downloadLinks
        .map((item) => `<p><a href="${item.url}">Muat Turun: ${item.name}</a></p>`)
        .join("");

    const emailBody = {
        from: process.env.EMAIL_FROM || "onboarding@resend.dev",
        to: customer.email,
        subject: "Pembayaran Berjaya - Worksheet Anda",
        html: `
            <p>Salam ${customer.name},</p>
            <p>Terima kasih atas pembelian anda. Berikut adalah link muat turun worksheet anda:</p>
            ${linksHtml}
            <p>Simpan email ini untuk rujukan masa depan.</p>
        `
    };

    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(emailBody)
        });

        const resJson = await res.json();

        if (!res.ok) {
            console.error("Resend gagal hantar email:", resJson);
        } else {
            console.log("Email berjaya dihantar ke:", customer.email);
        }
    } catch (err) {
        console.error("Error semasa hantar email via Resend:", err);
    }
}

// ToyyibPay hantar callback dalam format multipart/form-data (bukan
// x-www-form-urlencoded), jadi URLSearchParams tak reti baca terus.
// Parser ringkas ni extract field name="x" -> value dari raw body.
function parseMultipartFormData(rawBody, contentType) {
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) return {};

    const boundary = "--" + boundaryMatch[1].trim();
    const parts = rawBody
        .split(boundary)
        .filter((p) => p.trim() && p.trim() !== "--");

    const fields = {};

    for (const part of parts) {
        const splitIndex = part.indexOf("\r\n\r\n");
        if (splitIndex === -1) continue;

        const headerSection = part.slice(0, splitIndex);
        let value = part.slice(splitIndex + 4);

        const nameMatch = headerSection.match(/name="([^"]+)"/);
        if (!nameMatch) continue;

        value = value.replace(/\r\n--$/, "").trim();
        fields[nameMatch[1]] = value;
    }

    return fields;
}

exports.handler = async (event) => {
    connectLambda(event);

    // --- DEBUG SEMENTARA: buang balik lepas isu ni selesai ---

    // ----------------------------------------------------------

    if (event.httpMethod !== "POST") {
        console.error("Method bukan POST:", event.httpMethod);
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    // ToyyibPay hantar body sebagai multipart/form-data, dan Netlify
    // encode ia sebagai base64 (isBase64Encoded: true) - decode dulu.
    const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf-8")
        : event.body;

    const contentType = event.headers["content-type"] || "";

    let status, orderId, refno, receivedHash;

    if (contentType.includes("multipart/form-data")) {
        const fields = parseMultipartFormData(rawBody, contentType);
        status = fields.status;
        orderId = fields.order_id;
        refno = fields.refno;
        receivedHash = fields.hash;
    } else {
        const params = new URLSearchParams(rawBody);
        status = params.get("status");
        orderId = params.get("order_id");
        refno = params.get("refno");
        receivedHash = params.get("hash");
    }

    // --- DEBUG SEMENTARA ---

    // -----------------------

    if (!orderId || !receivedHash) {
        console.error("Missing parameters - orderId atau hash kosong lepas parse.");
        return { statusCode: 400, body: "Missing parameters" };
    }

    // Wajib sahkan hash - jangan proses kalau tak sepadan
    const expectedHash = crypto
        .createHash("md5")
        .update(`${process.env.TOYYIBPAY_SECRET_KEY}${status}${orderId}${refno}ok`)
        .digest("hex");

    if (receivedHash !== expectedHash) {
        console.error("Hash tidak sepadan untuk order:", orderId);
        return { statusCode: 403, body: "Invalid hash" };
    }

    const store = getStore("orders");
    const order = await store.get(orderId, { type: "json" });

    if (!order) {
        console.error("Order tidak dijumpai:", orderId);
        return { statusCode: 404, body: "Order not found" };
    }

    if (status === "1") {
        // Pembayaran berjaya - sediakan link download
        const downloadLinks = order.products.map((id) => ({
            name: PRODUCTS[id].name,
            url: PRODUCTS[id].fileUrl
        }));

        await store.setJSON(orderId, {
            ...order,
            status: "paid",
            refno,
            paidAt: new Date().toISOString(),
            downloadLinks
        });

        // Hantar email confirmation - tak block response utama kalau gagal
        await sendConfirmationEmail(order.customer, downloadLinks);
    } else {
        // status 2 = pending, 3 = fail
        await store.setJSON(orderId, {
            ...order,
            status: status === "3" ? "failed" : "pending",
            refno
        });
    }

    return { statusCode: 200, body: "OK" };
};
