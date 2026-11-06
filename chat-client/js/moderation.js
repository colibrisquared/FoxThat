const chat = document.getElementById('chat');

// == CLEAR ALL MESSAGE ==

document.getElementById('clear-chat').addEventListener('click', () => {
    chat.replaceChildren();
});

// == CLEAR X MESSAGE ==

const btn_clear_x = document.getElementById('clear-X-message');
const nb_message = document.getElementById('message-nb-to-clear');

btn_clear_x.addEventListener('click', () => {
    const x = parseInt(nb_message.value,10);

    if (isNaN(x) || x < 1) return;

    for (let i=0; i<x && chat.lastElementChild; i++){
        chat.lastElementChild.remove();
    }
});


// == FILTER X MESSAGE ==

const btn_filter_x = document.getElementById('filter-X-message');
const nb_message_filter = document.getElementById('message-nb-to-filter');

btn_filter_x.addEventListener('click', () => {
    const x = parseInt(nb_message_filter.value, 10);
    if (isNaN(x) || x < 1) return;

    const derniers = Array.from(chat.children).slice(-x);

    derniers.forEach(enfant => {
        const message = enfant.matches('.msg-text')
            ? enfant
            : enfant.querySelector('.msg-text');

        if (message) message.textContent = PARAM.filter_msg;
    });
});