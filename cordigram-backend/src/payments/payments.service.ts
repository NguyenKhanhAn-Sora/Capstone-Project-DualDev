import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Stripe from 'stripe';
import { ConfigService } from '../config/config.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { PaymentTransaction } from './payment-transaction.schema';

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(PaymentTransaction.name)
    private readonly paymentTransactions: Model<PaymentTransaction>,
  ) {
    this.stripe = new Stripe(this.config.stripeSecretKey);
  }

  async createCheckoutSession(opts: {
    userId: string;
    email: string;
    dto: CreateCheckoutSessionDto;
  }) {
    const { userId, email, dto } = opts;

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (dto.currency ?? 'vnd').toLowerCase(),
            unit_amount: dto.amount,
            product_data: {
              name: dto.campaignName || 'Cordigram Ads Campaign',
              description:
                dto.description ||
                'Payment for promoted campaign in Cordigram Home Feed.',
            },
          },
        },
      ],
      success_url: `${this.config.frontendUrl}/ads/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.config.frontendUrl}/ads/payment/cancel`,
      metadata: {
        userId,
        objective: dto.objective ?? '',
        adFormat: dto.adFormat ?? '',
        boostPackageId: dto.boostPackageId,
        durationPackageId: dto.durationPackageId,
      },
    });

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    await this.paymentTransactions.findOneAndUpdate(
      { sessionId: session.id },
      {
        userId,
        sessionId: session.id,
        paymentIntentId,
        customerEmail: email,
        amountTotal: dto.amount,
        currency: (dto.currency ?? 'vnd').toLowerCase(),
        paymentStatus: session.payment_status,
        checkoutStatus: session.status,
        objective: dto.objective ?? '',
        adFormat: dto.adFormat ?? '',
        boostPackageId: dto.boostPackageId,
        durationPackageId: dto.durationPackageId,
      },
      { upsert: true, new: true },
    );

    return {
      id: session.id,
      paymentIntentId,
      url: session.url,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
    };
  }

  async getCheckoutSessionStatus(sessionId: string, userId?: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    await this.paymentTransactions.findOneAndUpdate(
      { sessionId: session.id },
      {
        ...(userId ? { userId } : {}),
        paymentIntentId,
        paymentStatus: session.payment_status,
        checkoutStatus: session.status,
        amountTotal: session.amount_total ?? 0,
        currency: session.currency ?? 'vnd',
        customerEmail: session.customer_details?.email ?? null,
        ...(session.payment_status === 'paid' ? { paidAt: new Date() } : {}),
      },
      { upsert: true, new: true },
    );

    return {
      id: session.id,
      paymentIntentId,
      status: session.status,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email ?? null,
      metadata: session.metadata ?? {},
    };
  }

  async markCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    const metadata = session.metadata ?? {};

    await this.paymentTransactions.findOneAndUpdate(
      { sessionId: session.id },
      {
        userId: metadata.userId ?? '',
        sessionId: session.id,
        paymentIntentId,
        customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
        amountTotal: session.amount_total ?? 0,
        currency: session.currency ?? 'vnd',
        paymentStatus: session.payment_status,
        checkoutStatus: session.status,
        objective: metadata.objective ?? '',
        adFormat: metadata.adFormat ?? '',
        boostPackageId: metadata.boostPackageId ?? '',
        durationPackageId: metadata.durationPackageId ?? '',
        ...(session.payment_status === 'paid' ? { paidAt: new Date() } : {}),
      },
      { upsert: true, new: true },
    );
  }

  async getMyAdsCreationStatus(userId: string) {
    const latestPaidTransaction = await this.paymentTransactions
      .findOne({
        userId,
        $or: [
          { paymentStatus: 'paid' },
          { paymentStatus: 'no_payment_required' },
          { checkoutStatus: 'complete' },
        ],
      })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean();

    return {
      hasCreatedAds: Boolean(latestPaidTransaction),
      latestPaidAt: latestPaidTransaction?.paidAt ?? null,
      latestPaymentId:
        latestPaidTransaction?.paymentIntentId ??
        latestPaidTransaction?.sessionId ??
        null,
    };
  }

  constructWebhookEvent(rawBody: Buffer, signature: string | undefined) {
    if (!signature) {
      throw new InternalServerErrorException('Missing Stripe signature header');
    }

    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.config.stripeWebhookSecret,
    );
  }
}
