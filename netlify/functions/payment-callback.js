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

exports.handler = async (event) => {
    connectLambda(event);

    // --- DEBUG SEMENTARA: buang balik lepas isu ni selesai ---
    console.log("Content-Type:", event.headers["content-type"]);
    console.log("isBase64Encoded:", event.isBase64Encoded);
    console.log("Raw body:", event.body);
    // ----------------------------------------------------------

    if (event.httpMethod !== "POST") {
        console.error("Method bukan POST:", event.httpMethod);
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const params = new URLSearchParams(event.body);
    const status = params.get("status");
    const orderId = params.get("order_id");
    const refno = params.get("refno");
    const receivedHash = params.get("hash");

    // --- DEBUG SEMENTARA ---
    console.log("Parsed:", { status, orderId, refno, receivedHash });
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
