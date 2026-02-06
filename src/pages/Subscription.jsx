import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Check, Crown } from 'lucide-react';
import './Subscription.css';

const Subscription = () => {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const currentTier = userData?.subscriptionTier || 'free';

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      features: [
        'Access to 5 companions per month',
        'Create up to 3 custom companions',
        'Basic voice sessions',
        'Community support'
      ],
      buttonText: 'Current Plan',
      buttonDisabled: currentTier === 'free',
      popular: false
    },
    {
      name: 'Premium',
      price: '$9.99',
      period: 'per month',
      features: [
        'Unlimited companion access',
        'Create unlimited custom companions',
        'Advanced voice sessions',
        'Priority support',
        'Session analytics',
        'Export transcripts'
      ],
      buttonText: currentTier === 'premium' ? 'Current Plan' : 'Upgrade to Premium',
      buttonDisabled: currentTier === 'premium',
      popular: true
    }
  ];

  const handleSubscribe = async (planName) => {
    if (planName === 'Premium' && currentTier !== 'premium') {
      setLoading(true);
      // Integrate payment processing here (Stripe, etc.)
      // For now, this is a placeholder
      console.log('Upgrading to Premium...');
      setTimeout(() => {
        setLoading(false);
        alert('Payment integration coming soon!');
      }, 1000);
    }
  };

  return (
    <div className="subscription-page">
      <div className="page-container">
        <div className="subscription-header">
          <h1 className="page-title">Subscription Plans</h1>
          <p className="subscription-subtitle">
            Choose the plan that best fits your learning needs
          </p>
        </div>

        <div className="plans-grid">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`plan-card ${plan.popular ? 'popular' : ''}`}
            >
              {plan.popular && (
                <div className="popular-badge">
                  <Crown size={16} />
                  Most Popular
                </div>
              )}
              <div className="plan-header">
                <h2 className="plan-name">{plan.name}</h2>
                <div className="plan-price">
                  <span className="price-amount">{plan.price}</span>
                  <span className="price-period">{plan.period}</span>
                </div>
              </div>
              <ul className="plan-features">
                {plan.features.map((feature, index) => (
                  <li key={index} className="feature-item">
                    <Check size={18} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSubscribe(plan.name)}
                className={`btn btn-plan ${plan.popular ? 'btn-primary' : 'btn-outline'}`}
                disabled={plan.buttonDisabled || loading}
              >
                {loading ? 'Processing...' : plan.buttonText}
              </button>
            </div>
          ))}
        </div>

        <div className="subscription-info">
          <h3>Frequently Asked Questions</h3>
          <div className="faq-list">
            <div className="faq-item">
              <h4>Can I cancel anytime?</h4>
              <p>Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period.</p>
            </div>
            <div className="faq-item">
              <h4>What payment methods do you accept?</h4>
              <p>We accept all major credit cards and PayPal.</p>
            </div>
            <div className="faq-item">
              <h4>Do you offer refunds?</h4>
              <p>Yes, we offer a 30-day money-back guarantee for all premium subscriptions.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Subscription;

