import { Customer } from "../model/customer.model.js";
import { Order } from "../model/order.model.js";
import nodemailer from "nodemailer";
import { OrderItems } from "../model/orderItem.model.js";
import mongoose from "mongoose";
import ejs from "ejs";

const transporter = nodemailer.createTransport({
  port: 465,
  host: "smtp.gmail.com",
  auth: {
    user: "mukuldixit931@gmail.com",
    pass: "oxfgqzeowaciixiv",
  },
  secure: true,
});

export const placeOrder = async (request, response, next) => {
  try {
    const orderIds = Promise.all(
      request.body.orderItems.map(async (orderItem) => {
        let newOrderItems = new OrderItems({
          quantity: orderItem.quantity,
          product: orderItem.productId._id,
        });
        await newOrderItems.save();
        return newOrderItems._id;
      })
    );

    const orderIdArray = await orderIds;
    const customerinfo = await Customer.findOne({
      _id: request.body.customerid,
    });
    if (!customerinfo)
      return response
        .status(401)
        .json({ message: "No user found", status: false });
    else {
      const billAmount = await Promise.all(
        orderIdArray.map(async (id) => {
          const item = await OrderItems.findById(id).populate(
            "product",
            "price"
          );
          return item.product.price * item.quantity;
        })
      );
      const sumPrice = billAmount.reduce((a, b) => a + b, 0);
      const order = new Order({
        customerid: customerinfo.id,
        deliveryAddress: request.body.deliveryAddress,
        billAmount: sumPrice,
        contactNumber: request.body.contactNumber,
        contactPerson: request.body.contactPerson,
        orderItem: orderIdArray,
        date: request.body.date,
      });

      await order.save();

      // return response.status(200).json({ orderdetail: order, status: true })
      const orderitems = await Order.findById({ _id: order._id }).populate({
        path: "orderItem",
        populate: { path: "product" },
      });
      const data = orderitems.orderItem.map((item, index) => {
        return item.product;
      });
      const price = orderitems.orderItem.map((item, index) => {
        return item.product.price;
      });
      Date.prototype.addDays = function (day) {
        var date = new Date(this.valueOf());
        date.setDate(date.getDate() + day);
        return date;
      };
      var date = new Date();
      await order.save();

      ejs.renderFile(
        "C:/Users/Hp/Downloads/handcraftMongoosenew/handcraft_mongodb/controller/ejsemail.ejs",
        { order: order, orderitems: data },
        (err, html) => {
          if (err) {
            console.error("Error rendering email template:", err);
            return;
          }
          var mailData = {
            from: "mukuldixit931@gmail.com",
            to: "bugslayers45@gmail.com",
            subject: "Order Confirmation",

            html: html,
          };
          transporter.sendMail(mailData, (error, info) => {
            if (error) {
              return console.log(error);
            }
            return response
              .status(200)
              .send({ message: "Mail send", message_id: info.messageId });
          });
        }
      );
      return response
        .status(200)
        .json({ orderdetail: order, orderitems: orderitems, status: true });
    }
  } catch (err) {
    return response.status(500).json({ error: err });
  }
};
export const orderDetailsByCustomerIdorOrderId = async (
  request,
  response,
  next
) => {
  try {
    const customer =
      (await Customer.findById({ _id: request.body.id })) ||
      (await Order.findById({ _id: request.body.id }));
    if (!customer)
      return response.status(401).json({ message: "invalid user" });
    else {
      const order = await Order.find({
        $or: [{ customerid: request.body.id }, { _id: request.body.id }],
      }).populate({
        path: "orderItem",
        populate: { path: "product" },
      });
      const ordercount = await Order.count({ customerid: request.body.id });
      if (order.length == 0)
        return response
          .status(200)
          .json({ message: "NO order Found", status: false });

      const customer =
        (await Customer.findById({ _id: request.body.id })) ||
        (await Order.findById({ _id: request.body.id }));
      if (!customer)
        return response.status(401).json({ message: "invalid user" });
      else {
        const order = await Order.find({
          $or: [{ customerid: request.body.id }, { _id: request.body.id }],
        }).populate({
          path: "orderItem",
          populate: { path: "product" },
        });
        if (order.length == 0)
          return response
            .status(401)
            .json({ message: "NO order Found", status: false });

        return response.status(200).json({ order, status: true });
      }
    }
  } catch (err) {
    return response.status(500).json({ error: "INTERNAL SERVER ERROR" });
  }
};

export const updateOrder = async (request, response, next) => {
  try {
    let order = await Order.findById(request.params.orderId);
    if (!order)
      return response.status(401).json({ message: "Order ID nor found" });
    if (order.status == "shipped")
      return response.status(200).json({ status: "Order has already shipped" });
    order = await Order.findByIdAndUpdate(
      request.params.orderId,
      {
        status: "shipped",
      },
      { new: true }
    );
    return response.status(200).json({ Order: order, status: true });
  } catch (err) {
    return response.status(500).json({ error: "Internal Server Error" });
  }
};

export const allOrder = async (request, response, next) => {
  try {
    let allOrders = await Order.find();
    return response.status(200).json({ orders: allOrders, status: true });
  } catch (err) {
    return response
      .status(500)
      .json({ error: "Internal Server", status: false });
  }
};

export const orderDetailsBySeller = async (request, response, next) => {
  Order.aggregate([
    {
      $unwind: "$orderItem",
    },
    {
      $lookup: {
        localField: "orderItem",
        foreignField: "_id",
        from: "orderitems",
        as: "OrderItems",
      },
    },
    {
      $unwind: "$OrderItems",
    },
    {
      $lookup: {
        localField: "OrderItems.product",
        foreignField: "_id",
        from: "products",
        as: "productDetails",
      },
    },
    {
      $unwind: "$productDetails",
    },
    {
      $addFields: {
        sellerId: "$productDetails.sellerId",
      },
    },
    {
      $match: { sellerId: new mongoose.Types.ObjectId("" + request.params.id) },
    },
  ])
    .then((result) => {
      return response.status(200).json({ sellerOrder: result, status: true });
    })
    .catch((err) => {
      return response
        .status(500)
        .json({ error: "Internal Server Error", status: false });
    });
};
