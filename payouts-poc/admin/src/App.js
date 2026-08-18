import React, { useEffect, useState } from 'react';

const ADMIN_TOKEN = 'PUT_ADMIN_TOKEN_HERE'; // replace during build or use env

function App(){
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [audits, setAudits] = useState([]);
  const [showAudits, setShowAudits] = useState(false);

  async function fetchPending(){
    setLoading(true);
    const res = await fetch('/admin/withdrawals?status=pending', {
      headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN }
    });
    const data = await res.json();
    setItems(data);
    setLoading(false);
  }

  useEffect(()=> { fetchPending(); }, []);

  async function approve(id){
    if(!window.confirm('Approve and execute withdrawal '+id+'?')) return;
    const res = await fetch('/withdrawals/' + id + '/confirm', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN, 'Content-Type': 'application/json' }
    });
    if(res.ok){
      alert('Executed');
      fetchPending();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || JSON.stringify(err)));
    }
  }

  async function fetchAudits(){
    setShowAudits(true);
    const res = await fetch('/admin/audit', { headers: { 'Authorization': 'Bearer ' + ADMIN_TOKEN } });
    const data = await res.json();
    setAudits(data);
  }

  return (
    <div style={{fontFamily:'sans-serif', padding:20}}>
      <h2>Admin — Withdrawals (pending)</h2>
      <div style={{marginBottom:10}}>
        <button onClick={fetchPending} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        <button onClick={fetchAudits} style={{marginLeft:8}}>Show Audit</button>
      </div>
      <table border="1" cellPadding="6" style={{marginTop:10, width:'100%', borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th>id</th><th>user</th><th>currency</th><th>gross</th><th>fee</th><th>net</th><th>dest</th><th>status</th><th>actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id}>
              <td style={{fontFamily:'monospace'}}>{it.id}</td>
              <td>{it.user_id}</td>
              <td>{it.currency}</td>
              <td>{it.gross_amount}</td>
              <td>{it.platform_fee}</td>
              <td>{it.net_amount}</td>
              <td style={{fontFamily:'monospace'}}>{it.destination_address}</td>
              <td>{it.status}</td>
              <td>
                <button onClick={()=>approve(it.id)} disabled={it.status !== 'pending'}>Approve & Execute</button>
              </td>
            </tr>
          ))}
          {items.length===0 && <tr><td colSpan="9">No pending withdrawals</td></tr>}
        </tbody>
      </table>

      {showAudits && (
        <div style={{marginTop:20}}>
          <h3>Admin Audit Log</h3>
          <table border="1" cellPadding="6" style={{width:'100%', borderCollapse:'collapse'}}>
            <thead>
              <tr><th>time</th><th>admin_token</th><th>action</th><th>withdrawal_id</th><th>tx_hash</th><th>details</th></tr>
            </thead>
            <tbody>
              {audits.map(a => (
                <tr key={a.id}>
                  <td>{a.created_at}</td>
                  <td style={{fontFamily:'monospace'}}>{a.admin_token}</td>
                  <td>{a.action}</td>
                  <td style={{fontFamily:'monospace'}}>{a.withdrawal_id}</td>
                  <td style={{fontFamily:'monospace'}}>{a.tx_hash}</td>
                  <td>{a.details}</td>
                </tr>
              ))}
              {audits.length===0 && <tr><td colSpan="6">No audit entries</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
