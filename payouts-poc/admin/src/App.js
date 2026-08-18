import React, { useEffect, useState } from 'react';

const ADMIN_TOKEN = 'PUT_ADMIN_TOKEN_HERE'; // replace during build or use env

function App(){
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{fontFamily:'sans-serif', padding:20}}>
      <h2>Admin — Withdrawals (pending)</h2>
      <button onClick={fetchPending} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
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
    </div>
  );
}

export default App;
