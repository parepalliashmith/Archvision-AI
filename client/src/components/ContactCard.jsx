import { Mail, MessageCircle, Phone } from 'lucide-react';

// The other party's contact details, shown once an enquiry connects a customer
// and a builder: tap to call, open WhatsApp, or send an email. `phone` is the
// E.164 number the server stores (e.g. +919876543210).
export default function ContactCard({ title, name, email, phone }) {
  const digits = phone ? phone.replace(/\D/g, '') : '';
  return (
    <div className="contact-card">
      <div className="contact-card-head">
        <span className="contact-card-title">{title}</span>
        <strong>{name}</strong>
      </div>
      <div className="contact-card-rows">
        {phone && <span className="contact-card-row"><Phone size={14} /> {phone}</span>}
        {email && <span className="contact-card-row"><Mail size={14} /> {email}</span>}
        {!phone && <span className="contact-card-row contact-card-muted">No phone number on file.</span>}
      </div>
      <div className="contact-card-actions">
        {phone && <a className="btn btn-primary btn-sm" href={`tel:${phone}`}><Phone size={14} /> Call</a>}
        {phone && <a className="btn btn-ghost btn-sm" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>}
        {email && <a className="btn btn-ghost btn-sm" href={`mailto:${email}`}><Mail size={14} /> Email</a>}
      </div>
    </div>
  );
}
